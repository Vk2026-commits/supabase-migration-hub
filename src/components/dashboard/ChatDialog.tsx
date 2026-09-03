import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  officerId: string;
  officerName: string;
  currentUserType: "company" | "officer";
}

export function ChatDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  officerId,
  officerName,
  currentUserType,
}: ChatDialogProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    loadMessages();
    return subscribeToMessages();
  }, [open, companyId, officerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("company_id", companyId)
      .eq("officer_id", officerId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      return;
    }

    setMessages(data || []);
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`chat-${companyId}-${officerId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `company_id=eq.${companyId},officer_id=eq.${officerId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || loading) return;

    setLoading(true);
    try {
      // Check conversation limits before sending first message
      if (messages.length === 0) {
        if (currentUserType === "company") {
          const { data: companyProfile } = await supabase
            .from("company_profiles")
            .select("subscription_tier")
            .eq("id", companyId)
            .single();
          
          const { data: companyConversations } = await supabase
            .from("messages")
            .select("officer_id")
            .eq("company_id", companyId);
          
          const uniqueOfficers = new Set(companyConversations?.map(m => m.officer_id) || []);
          
          if (companyProfile?.subscription_tier === 'free' && uniqueOfficers.size >= 3) {
            toast.error("You've reached the limit of 3 conversations on the free tier. Upgrade to continue.");
            setLoading(false);
            return;
          }
        } else if (currentUserType === "officer") {
          const { data: officerConversations } = await supabase
            .from("messages")
            .select("company_id")
            .eq("officer_id", officerId);
          
          const uniqueCompanies = new Set(officerConversations?.map(m => m.company_id) || []);
          
          if (uniqueCompanies.size >= 3) {
            toast.error("You've reached the limit of 3 conversations on the free tier. Upgrade to continue.");
            setLoading(false);
            return;
          }
        }
      }

      const { error } = await supabase.from("messages").insert({
        company_id: companyId,
        officer_id: officerId,
        sender_type: currentUserType,
        message: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage("");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Chat with {currentUserType === "company" ? officerName : companyName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div ref={scrollRef} className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map((msg) => {
                const isCurrentUser = msg.sender_type === currentUserType;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isCurrentUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {isCurrentUser
                          ? currentUserType === "company"
                            ? companyName[0]
                            : officerName[0]
                          : currentUserType === "company"
                          ? officerName[0]
                          : companyName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`rounded-lg px-4 py-2 max-w-[70%] ${
                        isCurrentUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <form onSubmit={handleSendMessage} className="flex gap-2 pt-4 border-t">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
