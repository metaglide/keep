import AlertSeverity from "@/app/(keep)/alerts/alert-severity";
import { AlertDto } from "@/entities/alerts/model";
import { useUsers } from "@/entities/users/model/useUsers";
import TimeAgo from "react-timeago";

// TODO: REFACTOR THIS TO SUPPORT ANY ACTIVITY TYPE, IT'S A MESS!

export function IncidentActivityItem({ activity }: { activity: any }) {
  const { data: users = [] } = useUsers();
  
  const title =
    typeof activity.initiator === "string"
      ? activity.initiator
      : activity.initiator?.name;
      
  const subTitle =
    activity.type === "comment"
      ? " Added a comment. "
      : activity.type === "statuschange"
      ? " Incident status changed. "
      : activity.type === "assign"
      ? " Incident assigned. "
      : activity.initiator?.status === "firing"
      ? " triggered"
      : " resolved" + ". ";
      
  // Function to render mentions in comment text
  const renderCommentWithMentions = (text: string) => {
    if (!text) return null;
    
    // Split the text by @mentions pattern
    const parts = text.split(/(@[\w.]+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const userEmail = part.substring(1);
        const user = users.find(u => u.email === userEmail);
        
        return (
          <span key={index} className="bg-blue-100 text-blue-800 px-1 rounded">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };
  
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
            ? renderCommentWithMentions(activity.text)
            : activity.text
          }
        </div>
      )}
    </div>
  );
}
