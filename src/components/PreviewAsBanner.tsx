import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewAs, setPreviewAs } from "@/lib/preview-as";
import { useNavigate } from "@/lib/router-compat";

const PreviewAsBanner = () => {
  const preview = usePreviewAs();
  const navigate = useNavigate();

  if (!preview) return null;

  return (
    <div className="sticky top-0 z-[60] w-full bg-primary text-primary-foreground">
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Eye className="h-4 w-4" />
          Previewing the site as {preview.name} ({preview.role})
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPreviewAs(null);
            navigate("/admin");
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Exit preview
        </Button>
      </div>
    </div>
  );
};

export default PreviewAsBanner;
