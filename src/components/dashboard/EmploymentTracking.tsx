import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Star, Calendar, CheckCircle, Clock } from "lucide-react";
import EvaluationForm from "./EvaluationForm";

interface EmploymentTrackingProps {
  companyId: string;
}

const EmploymentTracking = ({ companyId }: EmploymentTrackingProps) => {
  const [hires, setHires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);
  const [selectedHire, setSelectedHire] = useState<string>("");
  const [updateType, setUpdateType] = useState("performance_review");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(5);
  const [offerHire, setOfferHire] = useState<any>(null);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerAuthorized, setOfferAuthorized] = useState(false);
  const [offer, setOffer] = useState({ startDate: "", offeredPosition: "", hourlyRate: "", supervisorName: "", scheduledPost: "", scheduledShift: "", acceptanceDeadline: "", representativeName: "", representativeTitle: "Authorized Hiring Representative" });

  useEffect(() => {
    loadHires();
  }, [companyId]);

  const loadHires = async () => {
    try {
      const { data, error } = await supabase
        .from("hires")
        .select(`
          *,
          officer_profiles(*, profiles(full_name)),
          company_profiles(company_name,contact_person_name,contact_person_title),
          evaluations(*),
          employment_updates(*)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHires(data || []);
    } catch (error) {
      console.error("Error loading hires:", error);
      toast.error("Failed to load employment data");
    } finally {
      setLoading(false);
    }
  };

  const openOffer = (hire: any) => {
    const saved = hire.offer_terms || {};
    setOfferHire(hire);
    setOffer({
      startDate: saved.startDate || hire.hire_date || "",
      offeredPosition: saved.offeredPosition || hire.position_title || "Security Officer",
      hourlyRate: saved.hourlyRate || "",
      supervisorName: saved.supervisorName || "",
      scheduledPost: saved.scheduledPost || "",
      scheduledShift: saved.scheduledShift || "",
      acceptanceDeadline: saved.acceptanceDeadline || "",
      representativeName: saved.representativeName || (/kairos security/i.test(hire.company_profiles?.company_name || "") ? "Erika Garces" : hire.company_profiles?.contact_person_name) || "",
      representativeTitle: saved.representativeTitle || hire.company_profiles?.contact_person_title || "Authorized Hiring Representative",
    });
    setOfferAuthorized(false);
  };

  const saveOffer = async () => {
    if (!offer.startDate || !offer.offeredPosition.trim() || !offer.hourlyRate || !offer.supervisorName.trim() || !offer.scheduledPost.trim() || !offer.scheduledShift.trim() || !offer.acceptanceDeadline || !offer.representativeName.trim() || !offerAuthorized) {
      toast.error("Complete and authorize all offer details");
      return;
    }
    setOfferSaving(true);
    const { error } = await supabase.from("hires").update({
      hire_date: offer.startDate,
      position_title: offer.offeredPosition.trim(),
      offer_prepared_at: new Date().toISOString(),
      offer_terms: { ...offer, employerSignatureName: offer.representativeName.trim() },
    }).eq("id", offerHire.id);
    setOfferSaving(false);
    if (error) { toast.error("Offer could not be saved"); return; }
    toast.success("Offer prepared and sent to employee onboarding");
    setOfferHire(null);
    loadHires();
  };

  const periodNames: Record<string, string> = {
    '30_day': '30-Day',
    '90_day': '90-Day',
    '1_year': '1-Year'
  };

  const getEvaluationStatus = (evaluation: any) => {
    if (evaluation.completed_date) {
      return { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle };
    }
    if (evaluation.sent_date) {
      return { label: "Sent", color: "bg-blue-100 text-blue-800", icon: Clock };
    }
    if (new Date(evaluation.due_date) < new Date()) {
      return { label: "Overdue", color: "bg-red-100 text-red-800", icon: Calendar };
    }
    return { label: "Pending", color: "bg-gray-100 text-gray-800", icon: Calendar };
  };

  const handleSubmitUpdate = async () => {
    if (!selectedHire) {
      toast.error("Please select an employee");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in");
        return;
      }

      const { error } = await supabase.from("employment_updates").insert({
        hire_id: selectedHire,
        update_type: updateType,
        notes,
        rating: updateType === "performance_review" ? rating : null,
        created_by_user_id: session.user.id,
      });

      if (error) throw error;

      toast.success("Employment update recorded");
      setNotes("");
      setRating(5);
      setSelectedHire("");
      loadHires();
    } catch (error) {
      console.error("Error submitting update:", error);
      toast.error("Failed to submit update");
    }
  };

  if (loading) {
    return <div>Loading employment tracking...</div>;
  }

  if (selectedEvaluation) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedEvaluation(null)}>
          ← Back to Hires
        </Button>
        <EvaluationForm 
          evaluation={selectedEvaluation} 
          onComplete={() => {
            setSelectedEvaluation(null);
            loadHires();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Manual Employment Update</CardTitle>
          <CardDescription>Track performance and updates for your hired officers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Employee</Label>
            <Select value={selectedHire} onValueChange={setSelectedHire}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {hires.map((hire) => (
                  <SelectItem key={hire.id} value={hire.id}>
                    {hire.officer_profiles?.profiles?.full_name || "Unknown"} - {hire.position_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Update Type</Label>
            <Select value={updateType} onValueChange={setUpdateType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="performance_review">Performance Review</SelectItem>
                <SelectItem value="status_update">Status Update</SelectItem>
                <SelectItem value="incident_report">Incident Report</SelectItem>
                <SelectItem value="commendation">Commendation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {updateType === "performance_review" && (
            <div className="space-y-2">
              <Label>Performance Rating</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="focus:outline-none"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details about this update..."
              rows={4}
            />
          </div>

          <Button onClick={handleSubmitUpdate}>Submit Update</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hired Officers</CardTitle>
          <CardDescription>Track performance evaluations and employment status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {hires.map((hire) => (
              <div key={hire.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {hire.officer_profiles?.profiles?.full_name || "Unknown"}
                    </h3>
                    <p className="text-sm text-muted-foreground">{hire.position_title}</p>
                    <p className="text-sm text-muted-foreground">
                      Hired: {new Date(hire.hire_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={hire.status === "active" ? "default" : "secondary"}
                  >
                    {hire.status}
                  </Badge>
                </div>
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${hire.offer_prepared_at ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                  <div><strong className="block text-sm">{hire.offer_prepared_at ? "Offer prepared" : "Offer needs preparation"}</strong><span className="text-xs text-muted-foreground">{hire.offer_prepared_at ? "The officer can review and accept it in onboarding." : "Complete the hiring terms before the officer accepts."}</span></div>
                  <Button size="sm" variant={hire.offer_prepared_at ? "outline" : "default"} onClick={() => openOffer(hire)}>{hire.offer_prepared_at ? "Review offer" : "Prepare offer"}</Button>
                </div>

                {hire.evaluations && hire.evaluations.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <h4 className="text-sm font-semibold">Performance Evaluations:</h4>
                    <div className="grid gap-2">
                      {hire.evaluations
                        .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                        .map((evaluation: any) => {
                          const status = getEvaluationStatus(evaluation);
                          const StatusIcon = status.icon;
                          
                          return (
                            <div
                              key={evaluation.id}
                              className="flex items-center justify-between bg-muted p-3 rounded"
                            >
                              <div className="flex items-center gap-3">
                                <StatusIcon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium text-sm">
                                    {periodNames[evaluation.evaluation_period]} Evaluation
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Due: {new Date(evaluation.due_date).toLocaleDateString()}
                                  </p>
                                  {evaluation.completed_date && evaluation.overall_rating && (
                                    <div className="flex gap-1 mt-1">
                                      {[...Array(evaluation.overall_rating)].map((_, i) => (
                                        <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={status.color}>
                                  {status.label}
                                </Badge>
                                {!evaluation.completed_date && (
                                  <Button
                                    size="sm"
                                    onClick={() => setSelectedEvaluation(evaluation)}
                                  >
                                    Complete
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {hire.employment_updates && hire.employment_updates.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <h4 className="text-sm font-semibold">Manual Updates:</h4>
                    {hire.employment_updates.slice(0, 3).map((update: any) => (
                      <div key={update.id} className="text-sm bg-muted p-2 rounded">
                        <div className="flex justify-between">
                          <span className="font-medium">{update.update_type.replace(/_/g, " ")}</span>
                          {update.rating && (
                            <div className="flex gap-1">
                              {[...Array(update.rating)].map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-muted-foreground">{update.notes}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(update.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {hires.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No officers hired yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(offerHire)} onOpenChange={(open) => !open && setOfferHire(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Prepare employee offer</DialogTitle><DialogDescription>These company-approved terms will be locked in the officer's onboarding packet. The officer will review, accept, and sign.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <DatePicker id="offer-start-date" label="Start Date" value={offer.startDate} onChange={(value) => setOffer({ ...offer, startDate: value })} />
            <div className="space-y-2"><Label>Position</Label><Input value={offer.offeredPosition} onChange={(e) => setOffer({ ...offer, offeredPosition: e.target.value })} /></div>
            <div className="space-y-2"><Label>Hourly Rate</Label><Input type="number" min="0" step="0.01" value={offer.hourlyRate} onChange={(e) => setOffer({ ...offer, hourlyRate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Supervisor</Label><Input value={offer.supervisorName} onChange={(e) => setOffer({ ...offer, supervisorName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Post or Assignment</Label><Input value={offer.scheduledPost} onChange={(e) => setOffer({ ...offer, scheduledPost: e.target.value })} /></div>
            <div className="space-y-2"><Label>Expected Shift</Label><Input value={offer.scheduledShift} onChange={(e) => setOffer({ ...offer, scheduledShift: e.target.value })} /></div>
            <DatePicker id="offer-acceptance-date" label="Accept By" value={offer.acceptanceDeadline} onChange={(value) => setOffer({ ...offer, acceptanceDeadline: value })} />
            <div className="space-y-2"><Label>Hiring Representative</Label><Input value={offer.representativeName} onChange={(e) => setOffer({ ...offer, representativeName: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Representative Title</Label><Input value={offer.representativeTitle} onChange={(e) => setOffer({ ...offer, representativeTitle: e.target.value })} /></div>
            <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4"><Checkbox checked={offerAuthorized} onCheckedChange={(value) => setOfferAuthorized(Boolean(value))} /><span className="text-sm"><strong className="block">Approve and sign for the company</strong>I confirm these terms and authorize my typed name as the company representative signature.</span></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOfferHire(null)}>Cancel</Button><Button onClick={saveOffer} disabled={offerSaving}>{offerSaving ? "Saving..." : "Save & Send Prepared Offer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmploymentTracking;
