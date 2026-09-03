import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";
import { ChatDialog } from "./ChatDialog";

interface OfficerMessagesProps {
  officerId: string;
  officerName: string;
}

export function OfficerMessages({ officerId, officerName }: OfficerMessagesProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadConversations();
    return subscribeToMessages();
  }, [officerId]);

  const loadConversations = async () => {
    try {
      // Get all unique companies that have messaged this officer
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
      .channel(`officer-messages-${officerId}-${Math.random().toString(36).slice(2)}`)
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
    return <div>Loading conversations...</div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            View and respond to messages from potential employers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Employers will be able to message you through your profile</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <Card key={conv.companyId} className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="p-4" onClick={() => handleOpenChat(conv)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{conv.companyName}</h3>
                          {!conv.isRead && conv.senderType === "company" && (
                            <Badge variant="default" className="text-xs">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.latestMessage}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(conv.latestMessageTime).toLocaleString()}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
