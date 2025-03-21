from enum import Enum


class TriggerType(str, Enum):
    ALERT = "alert"
    INCIDENT = "incident"
    MANUAL = "manual"
    INTERVAL = "interval"
    USER_ASSIGNED = "user_assigned"  # New trigger type for user mentions