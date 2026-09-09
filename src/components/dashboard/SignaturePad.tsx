import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type SignaturePadProps = {
  value: string;
  suggestedName: string;
  onChange: (value: string) => void;
};

export function SignaturePad({ value, suggestedName, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.strokeStyle = "#111827";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current!.getContext("2d")!;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  };

  const finish = () => {
    if (!drawingRef.current || !canvasRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
  };

  const createFromName = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !suggestedName.trim()) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111827";
    context.textAlign = "center";
    context.textBaseline = "middle";
    let size = 96;
    do {
      context.font = `italic ${size}px "Brush Script MT", "Snell Roundhand", "Segoe Script", cursive`;
      if (context.measureText(suggestedName).width <= canvas.width - 100) break;
      size -= 4;
    } while (size > 42);
    context.fillText(suggestedName, canvas.width / 2, canvas.height / 2 + 6);
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label>Your signature *</Label>
          <p className="mt-1 text-sm text-muted-foreground">Sign inside the box with your finger, mouse, or stylus.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={createFromName} disabled={!suggestedName.trim()}>
            Create signature from my name
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!value}>Clear</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-dashed bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          width={900}
          height={240}
          aria-label="Draw your signature"
          className="h-40 w-full cursor-crosshair touch-none sm:h-44"
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={finish}
        />
      </div>
      {value && (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Signature captured and saved with your application.
        </p>
      )}
    </div>
  );
}
