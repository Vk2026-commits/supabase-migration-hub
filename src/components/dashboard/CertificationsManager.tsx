import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Upload, FileText, X, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Certification {
  id: string;
  name: string;
  certification_type: string;
  license_level?: string;
  issuing_organization?: string;
  certification_number?: string;
  issue_date?: string;
  expiry_date?: string;
  document_front_url?: string;
  document_back_url?: string;
  description?: string;
}

interface CertificationsManagerProps {
  officerId: string;
  userId: string;
  onEnsureProfile?: () => Promise<any>;
}

const LICENSE_LEVELS = [
  { value: "level-ii", label: "Non-Commission Certificate or License" },
  { value: "level-iii", label: "Commission Certificate or License" },
  { value: "level-iv", label: "Personal Protection Officer (Bodyguard)" },
];

const TRAINING_CERTIFICATIONS = [
  "Use of Force Training",
  "Baton Training",
  "Handcuff Training",
  "CPR Training",
  "First Aid",
  "Electronic Control Device (ECD/Taser)",
  "OC Spray (Pepper Spray)",
  "Firearms Qualification",
  "Active Shooter Response",
  "De-escalation Techniques",
  "Emergency Response",
  "Report Writing",
  "Patrol Procedures",
  "Access Control",
  "CCTV Operations",
];

export function CertificationsManager({ officerId, userId, onEnsureProfile }: CertificationsManagerProps) {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [currentOfficerId, setCurrentOfficerId] = useState(officerId);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (officerId) {
      setCurrentOfficerId(officerId);
    }
    // Always attempt to load, will ensure/create profile if needed
    loadCertifications();
  }, [officerId]);

  const ensureOfficerId = async () => {
    if (currentOfficerId) return currentOfficerId;
    
    if (onEnsureProfile) {
      const profile = await onEnsureProfile();
      if (profile?.id) {
        setCurrentOfficerId(profile.id);
        return profile.id;
      }
    }
    return null;
  };

  // Generate signed URLs for all document paths
  const generateSignedUrls = async (certs: Certification[]) => {
    const urls: Record<string, string> = {};
    
    for (const cert of certs) {
      if (cert.document_front_url) {
        const signedUrl = await getSignedUrlForPath(cert.document_front_url);
        if (signedUrl) {
          urls[`${cert.id}-front`] = signedUrl;
        }
      }
      if (cert.document_back_url) {
        const signedUrl = await getSignedUrlForPath(cert.document_back_url);
        if (signedUrl) {
          urls[`${cert.id}-back`] = signedUrl;
        }
      }
    }
    
    setSignedUrls(urls);
  };

  // Get signed URL for a file path
  const getSignedUrlForPath = async (filePath: string): Promise<string | null> => {
    if (!filePath) return null;
    
    // Check if it's already a full URL (legacy data)
    if (filePath.startsWith('http')) {
      // Extract just the path portion
      const pathMatch = filePath.match(/certification-documents\/(.+)$/);
      if (pathMatch) {
        filePath = pathMatch[1];
      } else {
        return filePath; // Return as-is if can't extract
      }
    }
    
    try {
      const { data, error } = await supabase.storage
        .from("certification-documents")
        .createSignedUrl(filePath, 3600); // 1 hour expiry
      
      if (error) {
        console.error("Error creating signed URL:", error);
        return null;
      }
      
      return data.signedUrl;
    } catch (err) {
      console.error("Error generating signed URL:", err);
      return null;
    }
  };

  const loadCertifications = async () => {
    try {
      const id = await ensureOfficerId();
      if (!id) {
        setLoading(false);
        setCertifications([]);
        return;
      }

      const { data, error } = await supabase
        .from("certifications")
        .select("*")
        .eq("officer_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCertifications(data || []);
      
      // Generate signed URLs for all documents
      if (data && data.length > 0) {
        await generateSignedUrls(data);
      }
    } catch (error: any) {
      toast.error("Failed to load certifications");
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (
    file: File,
    certId: string,
    side: "front" | "back"
  ) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}/${certId}-${side}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("certification-documents")
      .upload(fileName, file, {
        upsert: true,
        cacheControl: "3600"
      });

    if (uploadError) throw uploadError;

    // Store the file path for later signed URL generation
    return fileName;
  };


  const handleDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    certId: string,
    side: "front" | "back"
  ) => {
    try {
      setUploading(`${certId}-${side}`);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      
      // Validate file size (10MB for documents)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        setUploading(null);
        return;
      }

      const url = await uploadDocument(file, certId, side);

      const updateField = side === "front" ? "document_front_url" : "document_back_url";
      const { error } = await supabase
        .from("certifications")
        .update({ [updateField]: url } as any)
        .eq("id", certId);

      if (error) throw error;

      toast.success(`Document uploaded successfully`);
      await loadCertifications();
      
      // Reset the input so the same file can be uploaded again if needed
      event.target.value = '';
    } catch (error: any) {
      toast.error("Upload failed: " + error.message);
      console.error("Upload error:", error);
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success("Document downloaded");
    } catch (error: any) {
      toast.error("Failed to download document");
    }
  };

  const removeDocument = async (certId: string, side: "front" | "back", url: string) => {
    try {
      const filePath = url.split("/certification-documents/")[1];
      if (filePath) {
        await supabase.storage.from("certification-documents").remove([filePath]);
      }

      const updateField = side === "front" ? "document_front_url" : "document_back_url";
      const { error } = await supabase
        .from("certifications")
        .update({ [updateField]: null } as any)
        .eq("id", certId);

      if (error) throw error;

      toast.success("Document removed");
      loadCertifications();
    } catch (error: any) {
      toast.error("Failed to remove document");
    }
  };

  const deleteCertification = async (id: string) => {
    try {
      const cert = certifications.find((c) => c.id === id);
      
      // Delete associated documents
      if (cert?.document_front_url) {
        const filePath = cert.document_front_url.split("/certification-documents/")[1];
        if (filePath) {
          await supabase.storage.from("certification-documents").remove([filePath]);
        }
      }
      if (cert?.document_back_url) {
        const filePath = cert.document_back_url.split("/certification-documents/")[1];
        if (filePath) {
          await supabase.storage.from("certification-documents").remove([filePath]);
        }
      }

      const { error } = await supabase.from("certifications").delete().eq("id", id);
      if (error) throw error;

      toast.success("Certification removed successfully");
      loadCertifications();
    } catch (error: any) {
      toast.error("Failed to remove certification");
    }
  };

  const LicenseForm = ({ licenseLevel, label }: { licenseLevel: string; label: string }) => {
    const [formData, setFormData] = useState({
      certification_number: "",
      issue_date: "",
      expiry_date: "",
    });
    const [pendingUploads, setPendingUploads] = useState<{ front?: File; back?: File }>({});

    const existingLicense = certifications.find(
      (c) => c.license_level === licenseLevel && c.certification_type === "license"
    );

    useEffect(() => {
      if (existingLicense) {
        setFormData({
          certification_number: existingLicense.certification_number || "",
          issue_date: existingLicense.issue_date || "",
          expiry_date: existingLicense.expiry_date || "",
        });
      }
    }, [existingLicense]);

    const handlePendingUpload = (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back") => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      
      setPendingUploads(prev => ({ ...prev, [side]: file }));
      toast.success(`${side === "front" ? "Front" : "Back"} document selected. Save the license to upload.`);
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.certification_number) {
        toast.error("License number is required");
        return;
      }

      const id = await ensureOfficerId();
      if (!id) {
        toast.error("Please create your profile first");
        return;
      }

      try {
        const certData = {
          officer_id: id,
          certification_type: "license",
          name: label,
          license_level: licenseLevel,
          certification_number: formData.certification_number,
          issue_date: formData.issue_date || null,
          expiry_date: formData.expiry_date || null,
          issuing_organization: "Texas Department of Public Safety",
        };

        let certId: string;

        if (existingLicense) {
          const { error } = await supabase
            .from("certifications")
            .update(certData)
            .eq("id", existingLicense.id);
          if (error) throw error;
          certId = existingLicense.id;
        } else {
          const { data, error } = await supabase.from("certifications").insert(certData).select().single();
          if (error) throw error;
          certId = data.id;
        }

        // Upload pending documents after saving
        if (pendingUploads.front) {
          const frontUrl = await uploadDocument(pendingUploads.front, certId, "front");
          await supabase.from("certifications").update({ document_front_url: frontUrl }).eq("id", certId);
        }
        if (pendingUploads.back) {
          const backUrl = await uploadDocument(pendingUploads.back, certId, "back");
          await supabase.from("certifications").update({ document_back_url: backUrl }).eq("id", certId);
        }

        toast.success("License saved successfully");
        setPendingUploads({});
        loadCertifications();
      } catch (error: any) {
        toast.error("Failed to save license");
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>Enter license details and upload license document</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${licenseLevel}-number`}>License Number *</Label>
              <Input
                id={`${licenseLevel}-number`}
                value={formData.certification_number}
                onChange={(e) =>
                  setFormData({ ...formData, certification_number: e.target.value })
                }
                placeholder="Enter license number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`${licenseLevel}-issue`}>Certification Date</Label>
                <Input
                  id={`${licenseLevel}-issue`}
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${licenseLevel}-expiry`}>Expiration Date</Label>
                <Input
                  id={`${licenseLevel}-expiry`}
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                />
              </div>
            </div>

            {/* Upload section - always visible */}
            <div className="space-y-4 pt-4 border-t">
              <Label>Upload License Document</Label>
              <div className="grid grid-cols-2 gap-4">
                {["front", "back"].map((side) => {
                  const hasDocument = existingLicense
                    ? (side === "front" ? existingLicense.document_front_url : existingLicense.document_back_url)
                    : null;
                  const displayUrl = existingLicense ? signedUrls[`${existingLicense.id}-${side}`] : null;
                  const isUploading = existingLicense && uploading === `${existingLicense.id}-${side}`;
                  const hasPending = pendingUploads[side as "front" | "back"];

                  return (
                    <div key={side} className="space-y-2">
                      <Label className="capitalize">{side} of License</Label>
                      {hasDocument && displayUrl ? (
                        <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border">
                          <img
                            src={displayUrl}
                            alt={`License ${side}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              onClick={() => handleDownload(displayUrl, `${label}-${side}.${hasDocument.split('.').pop()}`)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() =>
                                removeDocument(
                                  existingLicense!.id,
                                  side as "front" | "back",
                                  hasDocument
                                )
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : hasDocument ? (
                        <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">Loading...</p>
                          </div>
                        </div>
                      ) : hasPending ? (
                        <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border flex items-center justify-center bg-primary/10">
                          <div className="text-center text-primary">
                            <FileText className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">{hasPending.name}</p>
                            <p className="text-xs">Ready to upload</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border-2 border-dashed flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">No document</p>
                          </div>
                        </div>
                      )}
                      <input
                        id={`license-upload-${licenseLevel}-${side}`}
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                        onChange={(e) => {
                          if (existingLicense) {
                            handleDocumentUpload(e, existingLicense.id, side as "front" | "back");
                          } else {
                            handlePendingUpload(e, side as "front" | "back");
                          }
                        }}
                        disabled={isUploading}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={!!isUploading}
                        onClick={() => document.getElementById(`license-upload-${licenseLevel}-${side}`)?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {isUploading ? "Uploading..." : (hasDocument || hasPending) ? "Change" : "Upload"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button type="submit" className="w-full">
              {existingLicense ? "Update License" : "Save License"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  };

  const TrainingSection = () => {
    const [newTraining, setNewTraining] = useState({
      name: "",
      issuing_organization: "",
      certification_number: "",
      issue_date: "",
      expiry_date: "",
      description: "",
    });

    const trainings = certifications.filter((c) => c.certification_type === "training");

    const addTraining = async () => {
      if (!newTraining.name) {
        toast.error("Please select or enter a training type");
        return;
      }

      const id = await ensureOfficerId();
      if (!id) {
        toast.error("Please create your profile first");
        return;
      }

      try {
        const { error } = await supabase.from("certifications").insert({
          officer_id: id,
          certification_type: "training",
          name: newTraining.name,
          issuing_organization: newTraining.issuing_organization || null,
          certification_number: newTraining.certification_number || null,
          issue_date: newTraining.issue_date || null,
          expiry_date: newTraining.expiry_date || null,
          description: newTraining.description || null,
        });

        if (error) throw error;

        toast.success("Training added successfully");
        setNewTraining({
          name: "",
          issuing_organization: "",
          certification_number: "",
          issue_date: "",
          expiry_date: "",
          description: "",
        });
        loadCertifications();
      } catch (error: any) {
        toast.error("Failed to add training");
      }
    };

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Add Training Certificate</CardTitle>
            <CardDescription>
              Add training certificate such as CPR, use of force, handcuffing, etc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="training-name">Training Type *</Label>
              <Select
                value={newTraining.name}
                onValueChange={(value) => setNewTraining({ ...newTraining, name: value })}
              >
                <SelectTrigger id="training-name">
                  <SelectValue placeholder="Select training type" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_CERTIFICATIONS.map((training) => (
                    <SelectItem key={training} value={training}>
                      {training}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Other (Custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newTraining.name === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="custom-name">Custom Training Name</Label>
                <Input
                  id="custom-name"
                  placeholder="Enter training name"
                  onChange={(e) => setNewTraining({ ...newTraining, name: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="issuing-org">Issuing Organization</Label>
              <Input
                id="issuing-org"
                value={newTraining.issuing_organization}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, issuing_organization: e.target.value })
                }
                placeholder="e.g., American Red Cross"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cert-number">Certification Number (Optional)</Label>
              <Input
                id="cert-number"
                value={newTraining.certification_number}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, certification_number: e.target.value })
                }
                placeholder="Enter certification number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="training-issue">Issue Date</Label>
                <Input
                  id="training-issue"
                  type="date"
                  value={newTraining.issue_date}
                  onChange={(e) =>
                    setNewTraining({ ...newTraining, issue_date: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="training-expiry">Expiration Date</Label>
                <Input
                  id="training-expiry"
                  type="date"
                  value={newTraining.expiry_date}
                  onChange={(e) =>
                    setNewTraining({ ...newTraining, expiry_date: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newTraining.description}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, description: e.target.value })
                }
                placeholder="Brief description of the training..."
                rows={3}
              />
            </div>

            <Button onClick={addTraining} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Training
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {trainings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No training certificate added yet
              </CardContent>
            </Card>
          ) : (
            trainings.map((training) => (
              <Card key={training.id}>
                <CardContent className="py-4">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{training.name}</h4>
                          <Badge>Training</Badge>
                        </div>
                        <div className="text-sm space-y-1">
                          {training.issuing_organization && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Issued by:</span>{" "}
                              {training.issuing_organization}
                            </p>
                          )}
                          {training.certification_number && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Cert #:</span>{" "}
                              {training.certification_number}
                            </p>
                          )}
                          {training.issue_date && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Issue Date:</span>{" "}
                              {new Date(training.issue_date).toLocaleDateString()}
                            </p>
                          )}
                          {training.expiry_date && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Expires:</span>{" "}
                              {new Date(training.expiry_date).toLocaleDateString()}
                            </p>
                          )}
                          {training.description && (
                            <p className="text-muted-foreground mt-2">
                              <span className="font-medium">Description:</span>{" "}
                              {training.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCertification(training.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="pt-4 border-t">
                      <Label className="mb-2 block">Upload Certificate Document</Label>
                      <div className="grid grid-cols-2 gap-4">
                        {["front", "back"].map((side) => {
                          const hasDocument =
                            side === "front"
                              ? training.document_front_url
                              : training.document_back_url;
                          const displayUrl = signedUrls[`${training.id}-${side}`];
                          const isUploading = uploading === `${training.id}-${side}`;

                          return (
                            <div key={side} className="space-y-2">
                              <Label className="capitalize text-xs">
                                {side === "front" ? "Certificate" : "Additional Document"}
                              </Label>
                              {hasDocument && displayUrl ? (
                                <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border">
                                  <img
                                    src={displayUrl}
                                    alt={`Certificate ${side}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute top-2 right-2 flex gap-1">
                                    <Button
                                      variant="secondary"
                                      size="icon"
                                      onClick={() => handleDownload(displayUrl, `${training.name}-${side}.${hasDocument.split('.').pop()}`)}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="icon"
                                      onClick={() =>
                                        removeDocument(training.id, side as "front" | "back", hasDocument)
                                      }
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : hasDocument ? (
                                <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border flex items-center justify-center">
                                  <div className="text-center text-muted-foreground">
                                    <FileText className="h-6 w-6 mx-auto mb-1" />
                                    <p className="text-xs">Loading...</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative aspect-[3/2] bg-muted rounded-lg overflow-hidden border-2 border-dashed flex items-center justify-center">
                                  <div className="text-center text-muted-foreground">
                                    <FileText className="h-6 w-6 mx-auto mb-1" />
                                    <p className="text-xs">No document</p>
                                  </div>
                                </div>
                              )}
                              <input
                                id={`training-upload-${training.id}-${side}`}
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                                onChange={(e) =>
                                  handleDocumentUpload(e, training.id, side as "front" | "back")
                                }
                                disabled={isUploading}
                                className="hidden"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                disabled={isUploading}
                                onClick={() => document.getElementById(`training-upload-${training.id}-${side}`)?.click()}
                              >
                                <Upload className="mr-2 h-3 w-3" />
                                {isUploading ? "Uploading..." : hasDocument ? "Change" : "Upload"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading certifications...</div>;
  }

  return (
    <Tabs defaultValue="level-ii" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="level-ii">Non-Commission</TabsTrigger>
        <TabsTrigger value="level-iii">Commission</TabsTrigger>
        <TabsTrigger value="level-iv">Personal Protection Officer</TabsTrigger>
        <TabsTrigger value="training">Other Training</TabsTrigger>
      </TabsList>

      <TabsContent value="level-ii" className="space-y-4">
        <LicenseForm
          licenseLevel="level-ii"
          label="Non-Commission Certificate or License"
        />
      </TabsContent>

      <TabsContent value="level-iii" className="space-y-4">
        <LicenseForm
          licenseLevel="level-iii"
          label="Commission Certificate or License"
        />
      </TabsContent>

      <TabsContent value="level-iv" className="space-y-4">
        <LicenseForm licenseLevel="level-iv" label="Personal Protection Officer (Bodyguard)" />
      </TabsContent>

      <TabsContent value="training" className="space-y-4">
        <TrainingSection />
      </TabsContent>
    </Tabs>
  );
}
