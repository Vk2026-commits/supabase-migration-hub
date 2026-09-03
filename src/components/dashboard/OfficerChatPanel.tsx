import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Lock } from "lucide-react";
import { ChatDialog } from "./ChatDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface OfficerChatPanelProps {
  officerId: string;
  officerName: string;
}

export function OfficerChatPanel({ officerId, officerName }: OfficerChatPanelProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadConversations();
    const unsubscribe = subscribeToMessages();

    return unsubscribe;
  }, [officerId]);

  const loadConversations = async () => {
    try {
      const { data: messages, error } = await supabase
        .from("messages")
        .select(`
          *,
          company_profiles!inner(id, company_name, logo_url)
        `)
        .eq("officer_id", officerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by company and get latest message for each
      const companyMap = new Map();
      messages?.forEach((msg) => {
        const companyId = msg.company_profiles.id;
        if (!companyMap.has(companyId)) {
          companyMap.set(companyId, {
            companyId,
            companyName: msg.company_profiles.company_name,
            logoUrl: msg.company_profiles.logo_url,
            latestMessage: msg.message,
            latestMessageTime: msg.created_at,
            isRead: msg.is_read,
            senderType: msg.sender_type,
          });
        }
      });

      setConversations(Array.from(companyMap.values()));
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`officer-chat-panel-${officerId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `officer_id=eq.${officerId}`,
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleOpenChat = (conversation: any) => {
    setSelectedChat(conversation);
    setChatOpen(true);
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Messages
          </CardTitle>
          <CardDescription>
            Chat with potential employers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {conversations.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No messages yet</p>
              <p className="text-xs">Employers will be able to message you</p>
            </div>
          ) : (
            <>
              {conversations.length >= 3 && (
                <div className="p-2 bg-muted rounded-lg text-xs text-muted-foreground flex items-start gap-2">
                  <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <p className="text-xs">
                    You have reached the limit of 3 conversations on the free tier. 
                    Upgrade to continue chatting with more employers.
                  </p>
                </div>
              )}
              <div className="space-y-2 max-h-[150px] overflow-y-auto">
                {conversations.map((conv) => (
                  <Card 
                    key={conv.companyId} 
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleOpenChat(conv)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm truncate">{conv.companyName}</h4>
                            {!conv.isRead && conv.senderType === "company" && (
                              <Badge variant="default" className="text-xs">New</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.latestMessage}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(conv.latestMessageTime).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedChat && (
        <ChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          companyId={selectedChat.companyId}
          companyName={selectedChat.companyName}
          officerId={officerId}
          officerName={officerName}
          currentUserType="officer"
        />
      )}
    </>
  );
}
