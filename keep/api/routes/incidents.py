import logging
from datetime import datetime
from typing import List, Optional

from arq import ArqRedis
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from pusher import Pusher
from pydantic.types import UUID
from sqlmodel import Session

from keep.api.arq_pool import get_pool
from keep.api.bl.ai_suggestion_bl import AISuggestionBl
from keep.api.bl.enrichments_bl import EnrichmentsBl
from keep.api.bl.incident_reports import IncidentReportsBl
from keep.api.bl.incidents_bl import IncidentBl
from keep.api.consts import KEEP_ARQ_QUEUE_BASIC, REDIS
from keep.api.core.cel_to_sql.sql_providers.base import CelToSqlException
from keep.api.core.db import (
    DestinationIncidentNotFound,
    add_audit,
    confirm_predicted_incident_by_id,
    get_future_incidents_by_incident_id,
    get_incident_alerts_and_links_by_incident_id,
    get_incident_by_id,
    get_incidents_meta_for_tenant,
    get_last_alerts,
    get_rule,
    get_session,
    get_workflow_executions_for_incident_or_alert,
    merge_incidents_to_id,
)
from keep.api.core.dependencies import extract_generic_body, get_pusher_client
from keep.api.core.incidents import (
    get_incident_facets,
    get_incident_facets_data,
    get_incident_potential_facet_fields,
    get_last_incidents_by_cel,
)
from keep.api.models.action_type import ActionType
from keep.api.models.alert import AlertDto, EnrichIncidentRequestBody
from keep.api.models.db.alert import AlertAudit
from keep.api.models.db.incident import IncidentSeverity, IncidentStatus
from keep.api.models.facet import FacetOptionsQueryDto
from keep.api.models.incident import (
    IncidentCommit,
    IncidentDto,
    IncidentDtoIn,
    IncidentListFilterParamsDto,
    IncidentsClusteringSuggestion,
    IncidentSeverityChangeDto,
    IncidentSorting,
    IncidentStatusChangeDto,
    MergeIncidentsRequestDto,
    MergeIncidentsResponseDto,
    SplitIncidentRequestDto,
    SplitIncidentResponseDto,
)
from keep.api.models.workflow import WorkflowExecutionDTO
from keep.api.tasks.process_incident_task import process_incident
from keep.api.utils.enrichment_helpers import convert_db_alerts_to_dto_alerts
from keep.api.utils.pagination import (
    AlertWithIncidentLinkMetadataPaginatedResultsDto,
    IncidentsPaginatedResultsDto,
    WorkflowExecutionsPaginatedResultsDto,
)
from keep.api.utils.pluralize import pluralize
from keep.identitymanager.authenticatedentity import AuthenticatedEntity
from keep.identitymanager.identitymanagerfactory import IdentityManagerFactory
from keep.providers.providers_factory import ProvidersFactory
from keep.topologies.topologies_service import TopologiesService  # noqa
from keep.workflowmanager.workflowmanager import WorkflowManager

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("", description="Get incidents")
def get_incidents(
    limit: int = Query(20, description="Number of incidents to return"),
    offset: int = Query(0, description="Offset for pagination"),
    sorting: str = Query("-creation_time", description="Sorting field with optional - prefix for descending"),
    cel: str = Query(None, description="CEL filter expression"),
    candidate: bool = Query(None, description="Filter by candidate status"),
    predicted: bool = Query(None, description="Filter by predicted status"),
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["read:incident"])
    ),
    session: Session = Depends(get_session),
) -> IncidentsPaginatedResultsDto:
    tenant_id = authenticated_entity.tenant_id
    
    # Parse sorting parameter
    sort_field = sorting.lstrip("-")
    sort_desc = sorting.startswith("-")
    incident_sorting = IncidentSorting(id=sort_field, desc=sort_desc)
    
    try:
        # Get incidents using the core function
        incidents, total_count = get_last_incidents_by_cel(
            tenant_id=tenant_id,
            limit=limit,
            offset=offset,
            is_candidate=candidate,
            is_predicted=predicted,
            sorting=incident_sorting,
            cel=cel,
            with_alerts=True,
        )
        
        # Convert DB incidents to DTOs
        incident_dtos = [IncidentDto.from_db_incident(incident) for incident in incidents]
        
        return IncidentsPaginatedResultsDto(
            data=incident_dtos,
            total=total_count,
            limit=limit,
            offset=offset
        )
    except CelToSqlException as e:
        logger.error(f"Error in CEL to SQL conversion: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid CEL expression: {str(e)}")
    except Exception as e:
        logger.error(f"Error getting incidents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting incidents: {str(e)}")

@router.get("/meta", description="Get incidents metadata")
def get_incidents_meta(
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["read:incident"])
    ),
    session: Session = Depends(get_session),
):
    tenant_id = authenticated_entity.tenant_id
    
    try:
        # Get incidents metadata
        incidents_meta = get_incidents_meta_for_tenant(tenant_id, session)
        
        return incidents_meta
    except Exception as e:
        logger.error(f"Error getting incidents metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting incidents metadata: {str(e)}")

@router.get("/{incident_id}", description="Get incident by ID")
def get_incident_by_id_endpoint(
    incident_id: UUID,
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["read:incident"])
    ),
    session: Session = Depends(get_session),
) -> IncidentDto:
    tenant_id = authenticated_entity.tenant_id
    
    try:
        # Get incident by ID
        incident = get_incident_by_id(tenant_id, str(incident_id), session)
        
        if not incident:
            raise HTTPException(status_code=404, detail=f"Incident with ID {incident_id} not found")
        
        # Convert DB incident to DTO
        incident_dto = IncidentDto.from_db_incident(incident)
        
        return incident_dto
    except Exception as e:
        logger.error(f"Error getting incident by ID: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting incident by ID: {str(e)}")

@router.get("/{incident_id}/alerts", description="Get alerts for an incident")
def get_incident_alerts(
    incident_id: UUID,
    limit: int = Query(20, description="Number of alerts to return"),
    offset: int = Query(0, description="Offset for pagination"),
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["read:incident"])
    ),
    session: Session = Depends(get_session),
) -> AlertWithIncidentLinkMetadataPaginatedResultsDto:
    tenant_id = authenticated_entity.tenant_id
    
    try:
        # Get incident alerts
        alerts, total_count = get_incident_alerts_and_links_by_incident_id(
            tenant_id=tenant_id,
            incident_id=str(incident_id),
            limit=limit,
            offset=offset,
            session=session
        )
        
        # Convert DB alerts to DTOs
        alert_dtos = convert_db_alerts_to_dto_alerts(alerts)
        
        return AlertWithIncidentLinkMetadataPaginatedResultsDto(
            data=alert_dtos,
            total=total_count,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Error getting alerts for incident: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting alerts for incident: {str(e)}")

@router.get("/{incident_id}/workflows", description="Get workflow executions for an incident")
def get_incident_workflow_executions(
    incident_id: UUID,
    limit: int = Query(20, description="Number of workflow executions to return"),
    offset: int = Query(0, description="Offset for pagination"),
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["read:incident"])
    ),
    session: Session = Depends(get_session),
) -> WorkflowExecutionsPaginatedResultsDto:
    tenant_id = authenticated_entity.tenant_id
    
    try:
        # Get workflow executions for incident
        workflow_executions, total_count = get_workflow_executions_for_incident_or_alert(
            tenant_id=tenant_id,
            incident_id=str(incident_id),
            limit=limit,
            offset=offset,
            session=session
        )
        
        # Convert DB workflow executions to DTOs
        workflow_execution_dtos = [WorkflowExecutionDTO.from_orm(wf) for wf in workflow_executions]
        
        return WorkflowExecutionsPaginatedResultsDto(
            data=workflow_execution_dtos,
            total=total_count,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Error getting workflow executions for incident: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting workflow executions for incident: {str(e)}")

@router.post("/{incident_id}/comment", description="Add incident audit activity")
def add_comment(
    incident_id: UUID,
    change: IncidentStatusChangeDto,
    authenticated_entity: AuthenticatedEntity = Depends(
        IdentityManagerFactory.get_auth_verifier(["write:incident"])
    ),
    pusher_client: Pusher = Depends(get_pusher_client),
    session: Session = Depends(get_session),
) -> AlertAudit:
    import re
    from keep.api.models.db.comment_mention import CommentMention
    
    tenant_id = authenticated_entity.tenant_id
    extra = {
        "tenant_id": tenant_id,
        "commenter": authenticated_entity.email,
        "comment": change.comment,
        "incident_id": str(incident_id),
    }
    logger.info("Adding comment to incident", extra=extra)
    
    # Create the comment
    comment = add_audit(
        tenant_id,
        str(incident_id),
        authenticated_entity.email,
        ActionType.INCIDENT_COMMENT,
        change.comment,
    )
    
    # Parse mentions using regex
    mentions = re.findall(r'@([a-zA-Z0-9_\.]+)', change.comment)
    
    # Store mentions in the database
    if mentions:
        logger.info(f"Found mentions in comment: {mentions}", extra=extra)
        for mentioned_user in mentions:
            # Create a mention record
            mention = CommentMention(
                tenant_id=tenant_id,
                comment_id=comment.id,
                user_id=mentioned_user,
                created_at=datetime.utcnow()
            )
            session.add(mention)
        
        try:
            session.commit()
            logger.info(f"Stored {len(mentions)} mentions for comment {comment.id}", extra=extra)
            
            # Trigger workflow for user mentions
            if pusher_client:
                for mentioned_user in mentions:
                    # Trigger WebSocket notification
                    pusher_client.trigger(
                        f"private-{tenant_id}",
                        "user-mentioned",
                        {
                            "incident_id": str(incident_id),
                            "comment_id": str(comment.id),
                            "mentioned_user": mentioned_user,
                            "mentioned_by": authenticated_entity.email,
                        }
                    )
                    
                    # Trigger workflow for user mentions
                    workflow_manager = WorkflowManager.get_instance()
                    workflow_manager.insert_user_assigned_event(
                        tenant_id=tenant_id,
                        data={
                            "incident_id": str(incident_id),
                            "comment_id": str(comment.id),
                            "mentioned_user": mentioned_user,
                            "mentioned_by": authenticated_entity.email,
                            "comment_text": change.comment,
                        }
                    )
        except Exception as e:
            logger.error(f"Failed to store mentions: {str(e)}", extra=extra)
            session.rollback()

    # Trigger general comment notification
    if pusher_client:
        pusher_client.trigger(
            f"private-{tenant_id}", "incident-comment", {}
        )

    logger.info("Added comment to incident", extra=extra)
    return comment
