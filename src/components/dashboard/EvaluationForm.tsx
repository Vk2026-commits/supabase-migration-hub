import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Star } from "lucide-react";

interface EvaluationFormProps {
  evaluation: any;
  onComplete: () => void;
}

export default function EvaluationForm({ evaluation, onComplete }: EvaluationFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    overall_rating: 0,
    attendance_rating: 0,
    reliability_rating: 0,
    professionalism_rating: 0,
    quality_of_work_rating: 0,
    performance_notes: "",
    areas_of_improvement: "",
    would_rehire: "",
  });

  const periodNames: Record<string, string> = {
    '30_day': '30-Day',
    '90_day': '90-Day',
    '1_year': '1-Year'
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.overall_rating === 0 || formData.would_rehire === "") {
      toast.error("Please complete all required ratings");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("evaluations")
        .update({
          ...formData,
          would_rehire: formData.would_rehire === "yes",
          completed_date: new Date().toISOString(),
        })
        .eq("id", evaluation.id);

      if (error) throw error;

      toast.success("Evaluation submitted successfully!");
      onComplete();
    } catch (error: any) {
      console.error("Error submitting evaluation:", error);
      toast.error("Failed to submit evaluation");
    } finally {
      setLoading(false);
    }
  };

  const RatingSelector = ({ 
    label, 
    value, 
    onChange 
  }: { 
    label: string; 
    value: number; 
    onChange: (value: number) => void;
  }) => (
    <div className="space-y-2">
      <Label>{label} *</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            className={`p-2 rounded transition-colors ${
              value >= rating 
                ? "text-yellow-500" 
                : "text-gray-300 hover:text-yellow-300"
            }`}
          >
            <Star className="w-8 h-8" fill={value >= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === 0 && "Click to rate"}
        {value === 1 && "Poor"}
        {value === 2 && "Fair"}
        {value === 3 && "Good"}
        {value === 4 && "Very Good"}
        {value === 5 && "Excellent"}
      </p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {periodNames[evaluation.evaluation_period]} Performance Evaluation
        </CardTitle>
        <CardDescription>
          Please provide your feedback on this officer's performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <RatingSelector
            label="Overall Performance"
            value={formData.overall_rating}
            onChange={(value) => setFormData({ ...formData, overall_rating: value })}
          />

          <RatingSelector
            label="Attendance & Punctuality"
            value={formData.attendance_rating}
            onChange={(value) => setFormData({ ...formData, attendance_rating: value })}
          />

          <RatingSelector
            label="Reliability"
            value={formData.reliability_rating}
            onChange={(value) => setFormData({ ...formData, reliability_rating: value })}
          />

          <RatingSelector
            label="Professionalism"
            value={formData.professionalism_rating}
            onChange={(value) => setFormData({ ...formData, professionalism_rating: value })}
          />

          <RatingSelector
            label="Quality of Work"
            value={formData.quality_of_work_rating}
            onChange={(value) => setFormData({ ...formData, quality_of_work_rating: value })}
          />

          <div className="space-y-2">
            <Label htmlFor="performance_notes">Performance Notes</Label>
            <Textarea
              id="performance_notes"
              placeholder="Please provide specific examples of strong performance or areas where the officer excels..."
              value={formData.performance_notes}
              onChange={(e) => setFormData({ ...formData, performance_notes: e.target.value })}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="areas_of_improvement">Areas for Improvement</Label>
            <Textarea
              id="areas_of_improvement"
              placeholder="What areas could this officer improve in?"
              value={formData.areas_of_improvement}
              onChange={(e) => setFormData({ ...formData, areas_of_improvement: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Would you hire this officer again? *</Label>
            <RadioGroup
              value={formData.would_rehire}
              onValueChange={(value) => setFormData({ ...formData, would_rehire: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="yes" />
                <Label htmlFor="yes" className="cursor-pointer font-normal">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="no" />
                <Label htmlFor="no" className="cursor-pointer font-normal">No</Label>
              </div>
            </RadioGroup>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Submit Evaluation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
