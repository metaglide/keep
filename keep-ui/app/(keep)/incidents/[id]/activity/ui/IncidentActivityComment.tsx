import { IncidentDto } from "@/entities/incidents/model";
import { AuditEvent } from "@/utils/hooks/useAlerts";
import { TextInput, Button } from "@tremor/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { KeyedMutator } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import { showErrorToast } from "@/shared/ui";
import { useUsers } from "@/entities/users/model/useUsers";

interface MentionDropdownProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (user: { email: string; name: string }) => void;
}

const MentionDropdown = ({ query, position, onSelect }: MentionDropdownProps) => {
  const { data: users = [] } = useUsers();
  const filteredUsers = users.filter(
    (user) => 
      user.email.toLowerCase().includes(query.toLowerCase()) || 
      (user.name && user.name.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 5); // Limit to 5 results
  
  if (filteredUsers.length === 0) return null;
  
  return (
    <div 
      className="absolute z-50 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {filteredUsers.map((user) => (
        <div 
          key={user.email}
          className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
          onClick={() => onSelect(user)}
        >
          <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center mr-2">
            {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{user.name || user.email}</div>
            {user.name && <div className="text-xs text-gray-500">{user.email}</div>}
          </div>
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
  const api = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mentionState, setMentionState] = useState({
    isActive: false,
    query: "",
    position: { top: 0, left: 0 },
    startPosition: 0
  });

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

  const handleInputChange = (value: string) => {
    setComment(value);
    
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const query = mentionMatch[1];
      const rect = inputRef.current?.getBoundingClientRect();
      
      if (rect) {
        const position = {
          top: 40,
          left: 10 + mentionMatch.index * 8,
        };
        
        setMentionState({
          isActive: true,
          query,
          position,
          startPosition: mentionMatch.index
        });
      }
    } else {
      setMentionState({
        isActive: false,
        query: "",
        position: { top: 0, left: 0 },
        startPosition: 0
      });
    }
  };

  const handleSelectUser = (user: { email: string; name: string }) => {
    const beforeMention = comment.substring(0, mentionState.startPosition);
    const afterMention = comment.substring(inputRef.current?.selectionStart || 0);
    const newComment = `${beforeMention}@${user.email} ${afterMention}`;
    
    setComment(newComment);
    setMentionState({
      isActive: false,
      query: "",
      position: { top: 0, left: 0 },
      startPosition: 0
    });
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.selectionStart = inputRef.current.selectionEnd = 
          beforeMention.length + user.email.length + 2;
      }
    }, 0);
  };

  return (
    <div className="flex h-full w-full relative items-center">
      <TextInput
        ref={inputRef}
        value={comment}
        onValueChange={handleInputChange}
        placeholder="Add a new comment... (use @ to mention users)"
      />
      {mentionState.isActive && (
        <MentionDropdown 
          query={mentionState.query}
          position={mentionState.position}
          onSelect={handleSelectUser}
        />
      )}
      <Button
        color="orange"
        variant="secondary"
        className="ml-2.5"
        disabled={!comment}
        onClick={onSubmit}
      >
        Comment
      </Button>
    </div>
  );
}
