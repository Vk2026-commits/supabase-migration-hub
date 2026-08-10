import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Lock, CheckCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

interface SensitiveData {
  ssn_last_four: string | null;
  drivers_license_state: string | null;
  drivers_license_expiry: string | null;
  ssn_verified: boolean;
  drivers_license_verified: boolean;
}

export default function SensitiveDataManager() {
  const [loading, setLoading] = useState(false);
  const [sensitiveData, setSensitiveData] = useState<SensitiveData | null>(null);
  
  // SSN form state
  const [ssn, setSsn] = useState("");
  const [showSsn, setShowSsn] = useState(false);
  
  // Driver's license form state
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [showLicense, setShowLicense] = useState(false);

  useEffect(() => {
    fetchSensitiveData();
  }, []);

  const fetchSensitiveData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke("manage-sensitive-data", {
        body: { action: "get_masked_data", data: {} }
      });

      if (response.error) {
        console.error("Error fetching sensitive data:", response.error);
        return;
      }

      setSensitiveData(response.data?.data || null);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const formatSsn = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    
    // Format as XXX-XX-XXXX
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
  };

  const handleSsnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSsn(e.target.value);
    if (formatted.replace(/-/g, "").length <= 9) {
      setSsn(formatted);
    }
  };

  const saveSsn = async () => {
    if (ssn.replace(/-/g, "").length !== 9) {
      toast.error("Please enter a valid 9-digit SSN");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("manage-sensitive-data", {
        body: { action: "save_ssn", data: { ssn } }
      });

      if (response.error) {
        toast.error("Failed to save SSN");
        return;
      }

      toast.success("SSN saved securely");
      setSsn("");
      fetchSensitiveData();
    } catch (error) {
      toast.error("Failed to save SSN");
    } finally {
      setLoading(false);
    }
  };

  const saveDriversLicense = async () => {
    if (!licenseNumber || !licenseState) {
      toast.error("Please enter license number and state");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("manage-sensitive-data", {
        body: {
          action: "save_drivers_license",
          data: {
            license_number: licenseNumber,
            state: licenseState,
            expiry_date: licenseExpiry || null
          }
        }
      });

      if (response.error) {
        toast.error("Failed to save driver's license");
        return;
      }

      toast.success("Driver's license saved securely");
      setLicenseNumber("");
      setLicenseState("");
      setLicenseExpiry("");
      fetchSensitiveData();
    } catch (error) {
      toast.error("Failed to save driver's license");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Your sensitive information is encrypted and stored securely. Only you and authorized administrators can access this data.
          All access is logged for your protection.
        </AlertDescription>
      </Alert>

      {/* SSN Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Social Security Number
          </CardTitle>
          <CardDescription>
            Your SSN is encrypted and only the last 4 digits are visible
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sensitiveData?.ssn_last_four ? (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg">{sensitiveData.ssn_last_four}</span>
                {sensitiveData.ssn_verified ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" /> Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> Pending Verification
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSensitiveData(prev => prev ? { ...prev, ssn_last_four: null } : null)}>
                Update
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ssn">Social Security Number</Label>
                <div className="relative">
                  <Input
                    id="ssn"
                    type={showSsn ? "text" : "password"}
                    placeholder="XXX-XX-XXXX"
                    value={ssn}
                    onChange={handleSsnChange}
                    className="pr-10 font-mono"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSsn(!showSsn)}
                  >
                    {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button onClick={saveSsn} disabled={loading || ssn.replace(/-/g, "").length !== 9}>
                Save SSN Securely
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Driver's License Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Driver's License
          </CardTitle>
          <CardDescription>
            Your license number is encrypted for security
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sensitiveData?.drivers_license_state ? (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {sensitiveData.drivers_license_state} License
                  {sensitiveData.drivers_license_expiry && (
                    <span className="text-sm text-muted-foreground ml-2">
                      Expires: {new Date(sensitiveData.drivers_license_expiry).toLocaleDateString()}
                    </span>
                  )}
                </span>
                {sensitiveData.drivers_license_verified ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" /> Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> Pending Verification
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSensitiveData(prev => prev ? { ...prev, drivers_license_state: null } : null)}>
                Update
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license-number">License Number</Label>
                  <div className="relative">
                    <Input
                      id="license-number"
                      type={showLicense ? "text" : "password"}
                      placeholder="Enter license number"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="pr-10"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowLicense(!showLicense)}
                    >
                      {showLicense ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license-state">State</Label>
                  <Select value={licenseState} onValueChange={setLicenseState}>
                    <SelectTrigger id="license-state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-expiry">Expiration Date (Optional)</Label>
                <Input
                  id="license-expiry"
                  type="date"
                  value={licenseExpiry}
                  onChange={(e) => setLicenseExpiry(e.target.value)}
                />
              </div>
              <Button onClick={saveDriversLicense} disabled={loading || !licenseNumber || !licenseState}>
                Save Driver's License Securely
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
