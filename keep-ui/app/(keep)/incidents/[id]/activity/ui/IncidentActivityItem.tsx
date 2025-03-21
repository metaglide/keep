import AlertSeverity from "@/app/(keep)/alerts/alert-severity";
import { AlertDto } from "@/entities/alerts/model";
import TimeAgo from "react-timeago";

// Function to format comment text with styled mentions
const formatCommentWithMentions = (text: string) => {
  if (!text) return null;
  
  // Regular expression to find @mentions
  const mentionRegex = /@([a-zA-Z0-9_\.]+)/g;
  
  // Split the text by mentions
  const parts = text.split(mentionRegex);
  
  if (parts.length <= 1) {
    return <span>{text}</span>;
  }
  
  // Rebuild the text with styled mentions
  const result: JSX.Element[] = [];
  let i = 0;
  
  // Process each part
  while (i < parts.length) {
    // Add the text before the mention
    if (parts[i]) {
      result.push(<span key={`text-${i}`}>{parts[i]}</span>);
    }
    
    // Add the mention if there is one
    if (i + 1 < parts.length) {
      result.push(
        <span 
          key={`mention-${i}`} 
          className="bg-blue-100 text-blue-800 px-1 rounded font-medium"
        >
          @{parts[i + 1]}
        </span>
      );
      i += 2; // Skip the mention part
    } else {
      i++;
    }
  }
  
  return <>{result}</>;
};

// TODO: REFACTOR THIS TO SUPPORT ANY ACTIVITY TYPE, IT'S A MESS!

export function IncidentActivityItem({ activity }: { activity: any }) {
  const title =
    typeof activity.initiator === "string"
      ? activity.initiator
      : activity.initiator?.name;
  const subTitle =
    activity.type === "comment"
      ? " Added a comment. "
      : activity.type === "statuschange"
      ? " Incident status changed. "
      : activity.initiator?.status === "firing"
      ? " triggered"
      : " resolved" + ". ";
  return (
    <div className="relative h-full w-full flex flex-col">
      <div className="flex items-center gap-2">
        {activity.type === "alert" &&
          (activity.initiator as AlertDto)?.severity && (
            <AlertSeverity
              severity={(activity.initiator as AlertDto).severity}
            />
          )}
        <span className="font-semibold mr-2.5">{title}</span>
        <span className="text-gray-300">
          {subTitle} <TimeAgo date={activity.timestamp + "Z"} />
        </span>
      </div>
      {activity.text && (
        <div className="font-light text-gray-800">
          {activity.type === "comment" 
            ? formatCommentWithMentions(activity.text)
            : activity.text
          }
        </div>
      )}
    </div>
  );
}
