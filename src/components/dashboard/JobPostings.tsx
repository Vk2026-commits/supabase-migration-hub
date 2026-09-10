import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Briefcase, MapPin, DollarSign, X, Link2, Users, Mail, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface JobPostingsProps {
  companyId: string;
}

const JobPostings = ({ companyId }: JobPostingsProps) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<any>(null);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const [leadJob, setLeadJob] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    employment_type: [] as string[],
    shift_type: [] as string[],
    hourly_rate_min: "",
    hourly_rate_max: "",
    requirements: "",
    status: "active",
  });

  useEffect(() => {
    loadJobs();
  }, [companyId]);

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from("job_postings")
      .select("*, job_applications(count)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load job postings");
      return;
    }
    setJobs(data || []);

    const { data: leadRows } = await (supabase as any)
      .from("candidate_job_leads")
      .select("job_posting_id")
      .eq("company_id", companyId);
    const counts = (leadRows || []).reduce((result: Record<string, number>, lead: any) => {
      result[lead.job_posting_id] = (result[lead.job_posting_id] || 0) + 1;
      return result;
    }, {});
    setLeadCounts(counts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const jobData = {
        company_id: companyId,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        employment_type: formData.employment_type,
        shift_type: formData.shift_type,
        hourly_rate_min: formData.hourly_rate_min ? parseFloat(formData.hourly_rate_min) : null,
        hourly_rate_max: formData.hourly_rate_max ? parseFloat(formData.hourly_rate_max) : null,
        requirements: formData.requirements,
        status: formData.status,
      };

      if (editingJob) {
        const { error } = await supabase
          .from("job_postings")
          .update(jobData)
          .eq("id", editingJob.id);

        if (error) throw error;
        toast.success("Job posting updated!");
      } else {
        const { error } = await supabase.from("job_postings").insert(jobData);

        if (error) throw error;
        toast.success("Job posting created!");
      }

      setShowForm(false);
      setEditingJob(null);
      resetForm();
      loadJobs();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      location: "",
      employment_type: [],
      shift_type: [],
      hourly_rate_min: "",
      hourly_rate_max: "",
      requirements: "",
      status: "active",
    });
  };

  const handleEdit = (job: any) => {
    setEditingJob(job);
    setFormData({
      title: job.title,
      description: job.description || "",
      location: job.location || "",
      employment_type: job.employment_type || [],
      shift_type: job.shift_type || [],
      hourly_rate_min: job.hourly_rate_min?.toString() || "",
      hourly_rate_max: job.hourly_rate_max?.toString() || "",
      requirements: job.requirements || "",
      status: job.status,
    });
    setShowForm(true);
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job posting?")) return;

    const { error } = await supabase.from("job_postings").delete().eq("id", jobId);

    if (error) {
      toast.error("Failed to delete job posting");
      return;
    }

    toast.success("Job posting deleted");
    loadJobs();
  };

  const toggleArrayField = (field: "employment_type" | "shift_type", value: string) => {
    setFormData({
      ...formData,
      [field]: formData[field].includes(value)
        ? formData[field].filter((v) => v !== value)
        : [...formData[field], value],
    });
  };

  const copyCandidateLink = async (jobId: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/jobs/${jobId}`);
      toast.success("Candidate application link copied");
    } catch {
      toast.error("Could not copy the link. Please try again.");
    }
  };

  const openCandidateLeads = async (job: any) => {
    setLeadJob(job);
    setLoadingLeads(true);
    const { data, error } = await (supabase as any)
      .from("candidate_job_leads")
      .select("id,full_name,email,phone,status,captured_at,user_id")
      .eq("job_posting_id", job.id)
      .order("captured_at", { ascending: false });
    setLoadingLeads(false);
    if (error) {
      toast.error("Could not load prospective candidates");
      setLeads([]);
      return;
    }
    setLeads(data || []);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Job Postings</h3>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingJob(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              Post New Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingJob ? "Edit" : "Create"} Job Posting</DialogTitle>
              <DialogDescription>
                Post a job opening to attract security officers
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="Security Officer - Night Shift"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  placeholder="Dallas, TX"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hourly_rate_min">Min Hourly Rate</Label>
                  <Input
                    id="hourly_rate_min"
                    type="number"
                    step="0.01"
                    placeholder="15.00"
                    value={formData.hourly_rate_min}
                    onChange={(e) => setFormData({ ...formData, hourly_rate_min: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hourly_rate_max">Max Hourly Rate</Label>
                  <Input
                    id="hourly_rate_max"
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    value={formData.hourly_rate_max}
                    onChange={(e) => setFormData({ ...formData, hourly_rate_max: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Employment Type</Label>
                <div className="flex flex-wrap gap-2">
                  {["Full-time", "Part-time", "Contract", "Temporary"].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={`emp-${type}`}
                        checked={formData.employment_type.includes(type)}
                        onCheckedChange={() => toggleArrayField("employment_type", type)}
                      />
                      <Label htmlFor={`emp-${type}`} className="cursor-pointer font-normal">
                        {type}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Shift Preference</Label>
                <div className="flex flex-wrap gap-2">
                  {["First Shift (Day)", "Second Shift (Evening)", "Third Shift (Night)", "Weekends Only"].map((shift) => (
                    <div key={shift} className="flex items-center space-x-2">
                      <Checkbox
                        id={`shift-${shift}`}
                        checked={formData.shift_type.includes(shift)}
                        onCheckedChange={() => toggleArrayField("shift_type", shift)}
                      />
                      <Label htmlFor={`shift-${shift}`} className="cursor-pointer font-normal">
                        {shift}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Job Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the role, responsibilities, and work environment..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements</Label>
                <Textarea
                  id="requirements"
                  placeholder="Required certifications, experience, skills..."
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editingJob ? "Update" : "Post Job"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No job postings yet. Create your first posting to attract security officers.
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      {job.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </span>
                      {job.hourly_rate_min && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${job.hourly_rate_min}{job.hourly_rate_max && ` - $${job.hourly_rate_max}`}/hr
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copyCandidateLink(job.id)}><Link2 className="mr-2 h-4 w-4" />Copy candidate link</Button>
                    <Button variant="outline" size="sm" onClick={() => void openCandidateLeads(job)}><Users className="mr-2 h-4 w-4" />Leads ({leadCounts[job.id] || 0})</Button>
                    <Badge variant={job.status === "active" ? "default" : "secondary"}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {job.description && <p className="text-sm">{job.description}</p>}
                <div className="flex flex-wrap gap-2">
                  {job.employment_type?.map((type: string) => (
                    <Badge key={type} variant="outline">
                      {type}
                    </Badge>
                  ))}
                  {job.shift_type?.map((shift: string) => (
                    <Badge key={shift} variant="outline">
                      {shift}
                    </Badge>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    {job.job_applications?.[0]?.count || 0} interested officers
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(job)}>
                      Edit
                    </Button>
                    <Button
                      variant={job.status === 'pending' ? 'default' : 'outline'}
                      size="sm"
                      onClick={async () => {
                        await supabase
                          .from('job_postings')
                          .update({ status: 'pending' })
                          .eq('id', job.id);
                        loadJobs();
                        toast.success('Job marked as pending');
                      }}
                    >
                      Pending
                    </Button>
                    <Button
                      variant={job.status === 'filled' ? 'default' : 'outline'}
                      size="sm"
                      onClick={async () => {
                        await supabase
                          .from('job_postings')
                          .update({ status: 'filled' })
                          .eq('id', job.id);
                        loadJobs();
                        toast.success('Job marked as filled');
                      }}
                    >
                      Filled
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(job.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={Boolean(leadJob)} onOpenChange={(open) => { if (!open) { setLeadJob(null); setLeads([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prospective candidates</DialogTitle>
            <DialogDescription>{leadJob?.title} — contact information captured from the public job link.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {loadingLeads ? <p className="py-8 text-center text-sm text-muted-foreground">Loading candidates…</p> : leads.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No prospective candidates yet</p><p className="mt-1 text-sm text-muted-foreground">Share the candidate link to begin capturing interest.</p></div> : leads.map((lead) => <div key={lead.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{lead.full_name}</p><div className="mt-2 space-y-1 text-sm text-muted-foreground"><a className="flex items-center gap-2 hover:text-foreground" href={`mailto:${lead.email}`}><Mail className="h-4 w-4" />{lead.email}</a><a className="flex items-center gap-2 hover:text-foreground" href={`tel:${lead.phone}`}><Phone className="h-4 w-4" />{lead.phone}</a></div></div><Badge variant={lead.status === "applied" ? "default" : "secondary"}>{String(lead.status).replaceAll("_", " ")}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Captured {new Date(lead.captured_at).toLocaleString()}</p></div>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobPostings;
