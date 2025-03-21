import {
  IncidentDto,
  IncidentsMetaDto,
  PaginatedIncidentAlertsDto,
  PaginatedIncidentsDto,
} from "@/entities/incidents/model";
import { PaginatedWorkflowExecutionDto } from "@/shared/api/workflow-executions";
import useSWR, { SWRConfiguration } from "swr";
import { useWebsocket } from "./usePusher";
import { useCallback, useEffect, useState } from "react";
import { useAlerts } from "./useAlerts";
import { useApi } from "@/shared/lib/hooks/useApi";
import { v4 as uuidv4 } from "uuid";
import { toast } from "react-toastify";
import {
  DEFAULT_INCIDENTS_PAGE_SIZE,
  DEFAULT_INCIDENTS_SORTING,
} from "@/entities/incidents/model/models";

interface IncidentUpdatePayload {
  incident_id: string | null;
}

export interface Filters {
  status?: string[];
  severity?: string[];
  assignees?: string[];
  sources?: string[];
  affected_services?: string[];
}

export const useIncidents = (
  candidate: boolean | null = true,
  predicted: boolean | null = null,
  limit: number = DEFAULT_INCIDENTS_PAGE_SIZE,
  offset: number = 0,
  sorting: { id: string; desc: boolean } = DEFAULT_INCIDENTS_SORTING,
  cel: string = "",
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();

  const filtersParams = new URLSearchParams();

  if (typeof candidate === "boolean") {
    filtersParams.set("candidate", candidate.toString());
  }

  if (predicted !== undefined && predicted !== null) {
    filtersParams.set("predicted", predicted.toString());
  }

  if (limit !== undefined) {
    filtersParams.set("limit", limit.toString());
  }

  if (offset !== undefined) {
    filtersParams.set("offset", offset.toString());
  }

  if (sorting) {
    filtersParams.set("sorting", sorting.desc ? `-${sorting.id}` : sorting.id);
  }

  if (cel) {
    filtersParams.set("cel", cel);
  }

  const swrValue = useSWR<PaginatedIncidentsDto>(
    () =>
      api.isReady()
        ? `/incidents${filtersParams.size ? `?${filtersParams.toString()}` : ""}`
        : null,
    (url) => api.get(url),
    options
  );

  return {
    ...swrValue,
    isLoading: swrValue.isLoading || (!options.fallbackData && !api.isReady()),
  };
};

export const useIncidentAlerts = (
  incidentId: string,
  limit: number = 20,
  offset: number = 0,
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();
  return useSWR<PaginatedIncidentAlertsDto>(
    () =>
      api.isReady()
        ? `/incidents/${incidentId}/alerts?limit=${limit}&offset=${offset}`
        : null,
    (url) => api.get(url),
    options
  );
};

export const useIncidentFutureIncidents = (
  incidentId: string,
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();

  return useSWR<PaginatedIncidentsDto>(
    () => (api.isReady() ? `/incidents/${incidentId}/future_incidents` : null),
    (url) => api.get(url),
    options
  );
};

export const useIncident = (
  incidentId: string,
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();

  return useSWR<IncidentDto>(
    () => (api.isReady() && incidentId ? `/incidents/${incidentId}` : null),
    (url) => api.get(url),
    options
  );
};

export const useIncidentWorkflowExecutions = (
  incidentId: string,
  limit: number = 20,
  offset: number = 0,
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();
  return useSWR<PaginatedWorkflowExecutionDto>(
    () =>
      api.isReady()
        ? `/incidents/${incidentId}/workflows?limit=${limit}&offset=${offset}`
        : null,
    (url) => api.get(url),
    options
  );
};

export const usePollIncidentComments = (incidentId: string) => {
  const { bind, unbind } = useWebsocket();
  const { useAlertAudit } = useAlerts();
  const { mutate: mutateIncidentActivity } = useAlertAudit(incidentId);
  const handleIncoming = useCallback(
    (data: IncidentUpdatePayload) => {
      mutateIncidentActivity();
    },
    [mutateIncidentActivity]
  );
  
  const handleUserMention = useCallback(
    (data: any) => {
      if (data.incident_id === incidentId) {
        mutateIncidentActivity();
        
        if (typeof window !== 'undefined') {
          toast.info(`${data.mentioned_by} mentioned ${data.mentioned_user} in a comment`, {
            position: "top-right",
            autoClose: 5000,
          });
        }
      }
    },
    [incidentId, mutateIncidentActivity]
  );
  
  useEffect(() => {
    bind("incident-comment", handleIncoming);
    bind("user-mentioned", handleUserMention);
    return () => {
      unbind("incident-comment", handleIncoming);
      unbind("user-mentioned", handleUserMention);
    };
  }, [bind, unbind, handleIncoming, handleUserMention]);
};

export const usePollIncidentAlerts = (incidentId: string) => {
  const { bind, unbind } = useWebsocket();
  const { mutate } = useIncidentAlerts(incidentId);
  const handleIncoming = useCallback(
    (data: IncidentUpdatePayload) => {
      mutate();
    },
    [mutate]
  );
  useEffect(() => {
    bind("incident-change", handleIncoming);
    return () => {
      unbind("incident-change", handleIncoming);
    };
  }, [bind, unbind, handleIncoming]);
};

export const usePollIncidents = (
  mutateIncidents: any,
  paused: boolean = false
) => {
  const { bind, unbind } = useWebsocket();
  const [incidentChangeToken, setIncidentChangeToken] = useState<
    string | undefined
  >(undefined);
  const handleIncoming = useCallback(
    (data: any) => {
      mutateIncidents();
      setIncidentChangeToken(uuidv4());
    },
    [mutateIncidents, setIncidentChangeToken]
  );

  useEffect(() => {
    if (paused) {
      return;
    }

    bind("incident-change", handleIncoming);
    return () => {
      unbind("incident-change", handleIncoming);
    };
  }, [bind, unbind, handleIncoming, paused]);

  return {
    incidentChangeToken,
  };
};

export const useIncidentsMeta = (
  options: SWRConfiguration = {
    revalidateOnFocus: false,
  }
) => {
  const api = useApi();

  return useSWR<IncidentsMetaDto>(
    api.isReady() ? "/incidents/meta" : null,
    (url) => api.get(url),
    options
  );
};
