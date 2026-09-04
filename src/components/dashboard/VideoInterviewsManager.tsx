import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Upload, Video } from "lucide-react";

interface VideoInterviewsManagerProps {
  officerId: string;
  userId: string;
  onChanged?: () => void;
}

type VideoInterview = {
  id: string;
  title: string | null;
  description: string | null;
  video_url: string;
  created_at: string | null;
};

type VideoWithSignedUrl = VideoInterview & { signedUrl: string };

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "An unexpected error occurred";

export function VideoInterviewsManager({
  officerId,
  userId,
  onChanged,
}: VideoInterviewsManagerProps) {
  const [videos, setVideos] = useState<VideoWithSignedUrl[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadVideos = useCallback(async () => {
    if (!officerId) {
      setVideos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("video_interviews")
      .select("id,title,description,video_url,created_at")
      .eq("officer_id", officerId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Unable to load video interviews");
      setLoading(false);
      return;
    }

    const signedVideos = await Promise.all(
      (data || []).map(async (video) => {
        if (/^https?:\/\//i.test(video.video_url)) {
          return { ...video, signedUrl: video.video_url };
        }

        const { data: signedData } = await supabase.storage
          .from("video-interviews")
          .createSignedUrl(video.video_url, 3600);

        return { ...video, signedUrl: signedData?.signedUrl || "" };
      }),
    );

    setVideos(signedVideos);
    setLoading(false);
  }, [officerId]);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const uploadVideo = async () => {
    if (!officerId) {
      toast.error("Complete your officer profile before uploading a video");
      return;
    }
    if (!file) {
      toast.error("Choose a video to upload");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("Video size must be 50 MB or less");
      return;
    }

    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("video-interviews")
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { error: recordError } = await supabase.from("video_interviews").insert({
        officer_id: officerId,
        video_url: filePath,
        title: title.trim() || file.name,
        description: description.trim() || null,
      });

      if (recordError) {
        await supabase.storage.from("video-interviews").remove([filePath]);
        throw recordError;
      }

      setTitle("");
      setDescription("");
      setFile(null);
      toast.success("Video interview uploaded successfully");
      await loadVideos();
      onChanged?.();
    } catch (error: unknown) {
      toast.error(`Unable to upload video: ${getErrorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = async (video: VideoInterview) => {
    if (!window.confirm("Delete this video interview?")) return;

    const { error: recordError } = await supabase
      .from("video_interviews")
      .delete()
      .eq("id", video.id);

    if (recordError) {
      toast.error("Unable to delete the video interview");
      return;
    }

    const { error: storageError } = /^https?:\/\//i.test(video.video_url)
      ? { error: null }
      : await supabase.storage.from("video-interviews").remove([video.video_url]);

    if (storageError) {
      toast.warning("The interview record was deleted, but its video file could not be removed");
    } else {
      toast.success("Video interview deleted");
    }

    await loadVideos();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Interviews</CardTitle>
        <CardDescription>
          Upload a short introduction for qualified employers. Videos are private and opened with
          secure links.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="video-title">Title</Label>
            <Input
              id="video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Professional introduction"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-description">Description</Label>
            <Textarea
              id="video-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Briefly describe this interview"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-file">Video file</Label>
            <Input
              id="video-file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">MP4, WebM, or MOV; maximum 50 MB.</p>
          </div>
          <Button onClick={uploadVideo} disabled={uploading || !file} className="w-fit">
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Video"}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading video interviews...</p>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Video className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No video interviews yet</p>
            <p className="text-sm text-muted-foreground">
              Upload your first professional introduction above.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {videos.map((video) => (
              <div key={video.id} className="space-y-3 rounded-lg border p-4">
                {video.signedUrl ? (
                  <video
                    controls
                    preload="metadata"
                    className="aspect-video w-full rounded-md bg-black"
                  >
                    <source src={video.signedUrl} />
                  </video>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
                    Video unavailable
                  </div>
                )}
                <div>
                  <p className="font-medium">{video.title || "Video interview"}</p>
                  {video.description && (
                    <p className="text-sm text-muted-foreground">{video.description}</p>
                  )}
                </div>
                <Button variant="destructive" size="sm" onClick={() => deleteVideo(video)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
