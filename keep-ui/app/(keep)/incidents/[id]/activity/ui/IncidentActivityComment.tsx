import { IncidentDto } from "@/entities/incidents/model";
import { AuditEvent } from "@/utils/hooks/useAlerts";
import { TextInput, Button } from "@tremor/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { KeyedMutator } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import { showErrorToast } from "@/shared/ui";
import { useUsers } from "@/entities/users/model/useUsers";

const MentionDropdown = ({ 
  users, 
  searchTerm, 
  onSelect, 
  position 
}: { 
  users: { email: string; name?: string }[];
  searchTerm: string;
  onSelect: (user: { email: string; name?: string }) => void;
  position: { top: number; left: number };
}) => {
  const filteredUsers = users.filter(
    user => 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (filteredUsers.length === 0) return null;

  return (
    <div 
      className="absolute z-10 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {filteredUsers.map(user => (
        <div 
          key={user.email}
          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
          onClick={() => onSelect(user)}
        >
          <div className="font-medium">{user.name || user.email}</div>
          {user.name && <div className="text-xs text-gray-500">{user.email}</div>}
        </div>
      ))}
    </div>
  );
};

export function IncidentActivityComment({
  incident,
  mutator,
}: {
  incident: IncidentDto;
  mutator: KeyedMutator<AuditEvent[]>;
}) {
  const [comment, setComment] = useState("");
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const api = useApi();
  const { data: users = [] } = useUsers();

  const handleInputChange = (value: string) => {
    setComment(value);
    
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart || 0);
    }
    
    const textBeforeCursor = value.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setMentionSearch(mentionMatch[1]);
      setShowMentionDropdown(true);
      
      if (inputRef.current) {
        const inputRect = inputRef.current.getBoundingClientRect();
        const charWidth = 8;
        const mentionStartPos = textBeforeCursor.lastIndexOf('@');
        const offsetLeft = mentionStartPos * charWidth;
        
        setMentionPosition({
          top: inputRect.height + 5,
          left: Math.min(offsetLeft, inputRect.width - 200)
        });
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  const handleSelectUser = (user: { email: string; name?: string }) => {
    const textBeforeCursor = comment.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const mentionStartPos = textBeforeCursor.lastIndexOf('@');
      const newComment = 
        comment.substring(0, mentionStartPos) + 
        `@${user.email} ` + 
        comment.substring(cursorPosition);
      
      setComment(newComment);
      setShowMentionDropdown(false);
      
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = mentionStartPos + user.email.length + 2;
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            setCursorPosition(newCursorPos);
          }
        }, 0);
      }
    }
  };

  const onSubmit = useCallback(async () => {
    try {
      await api.post(`/incidents/${incident.id}/comment`, {
        status: incident.status,
        comment,
      });
      toast.success("Comment added!", { position: "top-right" });
      setComment("");
      mutator();
    } catch (error) {
      showErrorToast(error, "Failed to add comment");
    }
  }, [api, incident.id, incident.status, comment, mutator]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        comment
      ) {
        onSubmit();
      }
    },
    [onSubmit, comment]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [comment, handleKeyDown]);

  const renderFormattedComment = () => {
    if (!comment) return null;
    
    const parts = comment.split(/(@[\w.]+)/g);
    
    return (
      <div className="text-sm text-gray-600 mt-2 mb-1 px-2">
        {parts.map((part, index) => {
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
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <div className="relative">
        <TextInput
          ref={inputRef}
          value={comment}
          onValueChange={handleInputChange}
          placeholder="Add a new comment... Use @ to mention users"
          onClick={() => {
            if (inputRef.current) {
              setCursorPosition(inputRef.current.selectionStart || 0);
            }
          }}
          onKeyUp={() => {
            if (inputRef.current) {
              setCursorPosition(inputRef.current.selectionStart || 0);
            }
          }}
        />
        
        {showMentionDropdown && (
          <MentionDropdown 
            users={users}
            searchTerm={mentionSearch}
            onSelect={handleSelectUser}
            position={mentionPosition}
          />
        )}
      </div>
      
      {comment && renderFormattedComment()}
      
      <div className="flex items-center">
        <Button
          color="orange"
          variant="secondary"
          className="ml-auto mt-2"
          disabled={!comment}
          onClick={onSubmit}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
