import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Building2, Briefcase, Eye, TrendingUp, KeyRound, Mail, MoreVertical, Pause, XCircle, Trash2, PlayCircle, Search, AlertTriangle, Shield, UserPlus, PieChart as PieChartIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface Analytics {
  totalOfficers: number;
  totalCompanies: number;
  totalHires: number;
  totalProfileViews: number;
  recentOfficers: any[];
  recentCompanies: any[];
  topViewedOfficers: any[];
  recentHires: any[];
}

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [allOfficers, setAllOfficers] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [suspendedCompanies, setSuspendedCompanies] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [officerSearch, setOfficerSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [suspendedSearch, setSuspendedSearch] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState("view_only");
  const [inviting, setInviting] = useState(false);
  
  // Create user states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createRole, setCreateRole] = useState("view_only");
  const [creating, setCreating] = useState(false);
  
  // Admin permissions states
  const [manualResetDialogOpen, setManualResetDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  
  // Pie chart data states
  const [statsOverviewData, setStatsOverviewData] = useState<any[]>([]);
  const [officerAgeData, setOfficerAgeData] = useState<any[]>([]);
  const [officerStateData, setOfficerStateData] = useState<any[]>([]);
  const [companyStateData, setCompanyStateData] = useState<any[]>([]);
  const [officerLevelData, setOfficerLevelData] = useState<any[]>([]);
  const [selectedChart, setSelectedChart] = useState("stats-overview");
  
  // Edit states for Browse and Company Profiles tabs
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [editingOfficer, setEditingOfficer] = useState<any>(null);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [officerCertifications, setOfficerCertifications] = useState<any[]>([]);
  const [officerWorkHistory, setOfficerWorkHistory] = useState<any[]>([]);
  const [officerPhotos, setOfficerPhotos] = useState<Record<string, string>>({});

  const loadOfficerDetails = async (officerId: string, userId: string) => {
    const [certsResult, workResult] = await Promise.all([
      supabase.from("certifications").select("*").eq("officer_id", officerId).order("created_at", { ascending: false }),
      supabase.from("work_history").select("*").eq("officer_id", officerId).order("start_date", { ascending: false }),
    ]);
    setOfficerCertifications(certsResult.data || []);
    setOfficerWorkHistory(workResult.data || []);

    // Load photos from storage
    try {
      const { data: files } = await supabase.storage.from("officer-photos").list(userId, { limit: 100 });
      if (files && files.length > 0) {
        const photoMap: Record<string, string> = {};
        for (const file of files) {
          const photoType = file.name.split(".")[0];
          const { data: signedData } = await supabase.storage
            .from("officer-photos")
            .createSignedUrl(`${userId}/${file.name}`, 3600);
          if (signedData?.signedUrl) {
            photoMap[photoType] = signedData.signedUrl;
          }
        }
        setOfficerPhotos(photoMap);
      } else {
        setOfficerPhotos({});
      }
    } catch (error) {
      console.error("Error loading officer photos:", error);
      setOfficerPhotos({});
    }
  };

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to access admin panel");
        navigate("/auth");
        return;
      }

      // Check if user has admin role
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (rolesError || !roles) {
        toast.error("You don't have admin access");
        navigate("/dashboard");
        return;
      }

      await loadAnalytics();
      await loadAllProfiles();
      await loadAdminUsers();
    } catch (error) {
      console.error("Error checking admin access:", error);
      toast.error("Error checking permissions");
      navigate("/dashboard");
    }
  };

  const loadAdminUsers = async () => {
    try {
      // First get all admin/access roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .in("role", ["admin", "full_access", "view_only"])
        .order("created_at", { ascending: false });

      if (rolesError) throw rolesError;

      // Then fetch profile data for each user
      const usersWithProfiles = await Promise.all(
        (roles || []).map(async (role) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", role.user_id)
            .single();
          
          return {
            ...role,
            profiles: profile
          };
        })
      );

      setAdminUsers(usersWithProfiles);
    } catch (error) {
      console.error("Error loading admin users:", error);
      toast.error("Error loading users");
    }
  };

  const loadAllProfiles = async () => {
    try {
      // Load all officers
      const { data: officers, error: officersError } = await supabase
        .from("officer_profiles")
        .select("*, profiles(full_name, email, created_at)")
        .order("created_at", { ascending: false });

      if (officersError) throw officersError;
      setAllOfficers(officers || []);

      // Load all companies (active)
      const { data: companies, error: companiesError } = await supabase
        .from("company_profiles")
        .select("*, profiles(email, created_at)")
        .neq("payment_status", "suspended")
        .order("created_at", { ascending: false });

      if (companiesError) throw companiesError;
      setAllCompanies(companies || []);

      // Load suspended companies
      const { data: suspended, error: suspendedError } = await supabase
        .from("company_profiles")
        .select("*, profiles(email, created_at)")
        .eq("payment_status", "suspended")
        .order("payment_due_date", { ascending: true });

      if (suspendedError) throw suspendedError;
      setSuspendedCompanies(suspended || []);
    } catch (error) {
      console.error("Error loading profiles:", error);
      toast.error("Error loading profile data");
    }
  };

  const handlePasswordReset = async (email: string, name: string) => {
    setResettingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('reset-user-password', {
        body: { email },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`Password reset email sent to ${name}`);
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error(error.message || "Failed to send password reset email");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleAccountStatusChange = async (
    userId: string, 
    newStatus: 'active' | 'paused' | 'cancelled' | 'deleted', 
    tableName: 'officer_profiles' | 'company_profiles',
    name: string
  ) => {
    try {
      const updateData: any = { account_status: newStatus };
      
      // If reactivating a company, reset payment status
      if (newStatus === 'active' && tableName === 'company_profiles') {
        updateData.payment_status = 'current';
      }

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;

      toast.success(`Account ${newStatus} for ${name}`);
      await loadAllProfiles();
    } catch (error: any) {
      console.error("Error updating account status:", error);
      toast.error(error.message || "Failed to update account status");
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteRole) {
      toast.error("Please fill in all required fields");
      return;
    }

    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('invite-admin-user', {
        body: {
          email: inviteEmail,
          full_name: inviteFullName,
          role: inviteRole,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("view_only");
      await loadAdminUsers();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast.error(error.message || "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createEmail || !createPassword) {
      toast.error("Email and password are required");
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: createEmail,
          password: createPassword,
          username: createUsername,
          full_name: createFullName,
          role: createRole,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`User ${createEmail} created successfully`);
      setCreateDialogOpen(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateUsername("");
      setCreateFullName("");
      setCreateRole("view_only");
      await loadAdminUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleManualPasswordReset = async () => {
    if (!newPassword) {
      toast.error("Please enter a new password");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('update-user-password', {
        body: {
          user_id: selectedUserId,
          new_password: newPassword,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`Password updated for ${selectedUserEmail}`);
      setManualResetDialogOpen(false);
      setNewPassword("");
      setSelectedUserId("");
      setSelectedUserEmail("");
    } catch (error: any) {
      console.error("Error updating password:", error);
      toast.error(error.message || "Failed to update password");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handlePauseUser = async (userId: string, email: string, paused: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('pause-user-account', {
        body: {
          user_id: userId,
          paused,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`Account ${paused ? 'paused' : 'unpaused'} for ${email}`);
      await loadAdminUsers();
    } catch (error: any) {
      console.error("Error pausing user:", error);
      toast.error(error.message || "Failed to update account status");
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('delete-user', {
        body: {
          user_id: userId,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) throw response.error;

      toast.success(`User ${email} deleted successfully`);
      await loadAdminUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Failed to delete user");
    }
  };

  const handleRemoveUserRole = async (userId: string, roleId: string, email: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast.success(`Removed access for ${email}`);
      await loadAdminUsers();
    } catch (error: any) {
      console.error("Error removing user role:", error);
      toast.error(error.message || "Failed to remove user access");
    }
  };

  const handleSaveOfficerProfile = async () => {
    if (!editingOfficer) return;
    
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("officer_profiles")
        .update(editingOfficer)
        .eq("id", editingOfficer.id);

      if (error) throw error;

      toast.success("Officer profile updated successfully");
      setSelectedOfficer(null);
      setEditingOfficer(null);
      await loadAllProfiles();
    } catch (error: any) {
      console.error("Error updating officer profile:", error);
      toast.error(error.message || "Failed to update officer profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveCompanyProfile = async () => {
    if (!editingCompany) return;
    
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("company_profiles")
        .update(editingCompany)
        .eq("id", editingCompany.id);

      if (error) throw error;

      toast.success("Company profile updated successfully");
      setSelectedCompany(null);
      setEditingCompany(null);
      await loadAllProfiles();
    } catch (error: any) {
      console.error("Error updating company profile:", error);
      toast.error(error.message || "Failed to update company profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Filter functions
  const filteredOfficers = allOfficers.filter((officer) => {
    const searchLower = officerSearch.toLowerCase();
    return (
      officer.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      officer.profiles?.email?.toLowerCase().includes(searchLower) ||
      officer.officer_number?.toLowerCase().includes(searchLower)
    );
  });

  const filteredCompanies = allCompanies.filter((company) => {
    const searchLower = companySearch.toLowerCase();
    return (
      company.company_name?.toLowerCase().includes(searchLower) ||
      company.profiles?.email?.toLowerCase().includes(searchLower) ||
      company.company_number?.toLowerCase().includes(searchLower)
    );
  });

  const filteredSuspended = suspendedCompanies.filter((company) => {
    const searchLower = suspendedSearch.toLowerCase();
    return (
      company.company_name?.toLowerCase().includes(searchLower) ||
      company.profiles?.email?.toLowerCase().includes(searchLower) ||
      company.company_number?.toLowerCase().includes(searchLower)
    );
  });

  // CSV Export Functions
  const downloadOfficersCSV = () => {
    const csvData = filteredOfficers.map(officer => ({
      Name: officer.profiles?.full_name || "",
      Phone: officer.phone || "",
      Email: officer.profiles?.email || ""
    }));

    const headers = ["Name", "Phone", "Email"];
    const csvContent = [
      headers.join(","),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row] || ""}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `officers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Officers CSV downloaded successfully");
  };

  const downloadCompaniesCSV = () => {
    const csvData = filteredCompanies.map(company => ({
      Name: company.company_name || "",
      Phone: company.company_phone || company.contact_cell_phone || "",
      Email: company.profiles?.email || company.contact_email || ""
    }));

    const headers = ["Name", "Phone", "Email"];
    const csvContent = [
      headers.join(","),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row] || ""}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `companies_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Companies CSV downloaded successfully");
  };

  const downloadSuspendedCSV = () => {
    const csvData = filteredSuspended.map(company => ({
      Name: company.company_name || "",
      Phone: company.company_phone || company.contact_cell_phone || "",
      Email: company.profiles?.email || company.contact_email || ""
    }));

    const headers = ["Name", "Phone", "Email"];
    const csvContent = [
      headers.join(","),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row] || ""}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `suspended_companies_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Suspended companies CSV downloaded successfully");
  };

  const loadAnalytics = async () => {
    try {
      // Get total counts
      const [officersCount, companiesCount, hiresCount, viewsCount] = await Promise.all([
        supabase.from("officer_profiles").select("*", { count: "exact", head: true }),
        supabase.from("company_profiles").select("*", { count: "exact", head: true }),
        supabase.from("hires").select("*", { count: "exact", head: true }),
        supabase.from("profile_views").select("*", { count: "exact", head: true }),
      ]);

      console.log("Counts:", { 
        officers: officersCount.count, 
        companies: companiesCount.count,
        hires: hiresCount.count,
        views: viewsCount.count 
      });

      // Get recent officers with registration date - use left join to avoid RLS issues
      const { data: recentOfficers, error: officersError } = await supabase
        .from("officer_profiles")
        .select("*, profiles(full_name, email, created_at)")
        .order("created_at", { ascending: false })
        .limit(10);

      if (officersError) console.error("Officers error:", officersError);

      // Get recent companies - use left join to avoid RLS issues
      const { data: recentCompanies, error: companiesError } = await supabase
        .from("company_profiles")
        .select("*, profiles(email, created_at)")
        .order("created_at", { ascending: false })
        .limit(10);

      if (companiesError) console.error("Companies error:", companiesError);

      // Get top viewed officers
      const { data: topViewed } = await supabase
        .from("profile_views")
        .select("officer_id, officer_profiles(*, profiles(full_name))")
        .order("viewed_at", { ascending: false });

      // Count views per officer
      const viewCounts: Record<string, { count: number; profile: any }> = {};
      topViewed?.forEach((view: any) => {
        const officerId = view.officer_id;
        if (!viewCounts[officerId]) {
          viewCounts[officerId] = { count: 0, profile: view.officer_profiles };
        }
        viewCounts[officerId].count++;
      });

      const topViewedOfficers = Object.entries(viewCounts)
        .map(([id, data]) => ({ ...data.profile, view_count: data.count }))
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, 10);

      // Get recent hires with details
      const { data: recentHires } = await supabase
        .from("hires")
        .select(`
          *,
          officer_profiles(*, profiles(full_name)),
          company_profiles(company_name)
        `)
        .order("created_at", { ascending: false })
        .limit(10);

      setAnalytics({
        totalOfficers: officersCount.count || 0,
        totalCompanies: companiesCount.count || 0,
        totalHires: hiresCount.count || 0,
        totalProfileViews: viewsCount.count || 0,
        recentOfficers: recentOfficers || [],
        recentCompanies: recentCompanies || [],
        topViewedOfficers,
        recentHires: recentHires || [],
      });
    } catch (error) {
      console.error("Error loading analytics:", error);
      toast.error("Error loading analytics data");
    } finally {
      setLoading(false);
    }
  };

  // Set up realtime subscriptions for automatic updates
  useEffect(() => {
    if (!analytics) return;

    const channel = supabase
      .channel('admin-analytics-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_profiles'
        },
        () => {
          console.log('Company profiles updated, reloading analytics');
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'officer_profiles'
        },
        () => {
          console.log('Officer profiles updated, reloading analytics');
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hires'
        },
        () => {
          console.log('Hires updated, reloading analytics');
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_views'
        },
        () => {
          console.log('Profile views updated, reloading analytics');
          loadAnalytics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [analytics]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const calculateDaysOnSite = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const preparePieChartData = async () => {
    // Stats Overview Pie Chart
    const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
    const statsData = [
      { name: 'Officers', value: analytics?.totalOfficers || 0, color: COLORS[0] },
      { name: 'Companies', value: analytics?.totalCompanies || 0, color: COLORS[1] },
      { name: 'Hires', value: analytics?.totalHires || 0, color: COLORS[2] },
      { name: 'Profile Views', value: analytics?.totalProfileViews || 0, color: COLORS[3] },
    ];
    setStatsOverviewData(statsData);

    // Officer Age Groups
    const ageGroups = {
      '18-24': 0,
      '25-34': 0,
      '35-44': 0,
      '45-54': 0,
      '55-64': 0,
      '65+': 0,
    };

    allOfficers.forEach((officer) => {
      if (officer.date_of_birth) {
        const age = calculateAge(officer.date_of_birth);
        if (age >= 18 && age <= 24) ageGroups['18-24']++;
        else if (age >= 25 && age <= 34) ageGroups['25-34']++;
        else if (age >= 35 && age <= 44) ageGroups['35-44']++;
        else if (age >= 45 && age <= 54) ageGroups['45-54']++;
        else if (age >= 55 && age <= 64) ageGroups['55-64']++;
        else if (age >= 65) ageGroups['65+']++;
      }
    });

    const AGE_COLORS = ['#8b5cf6', '#ec4899', '#f97316', '#eab308', '#84cc16', '#14b8a6'];
    const ageData = Object.entries(ageGroups).map(([name, value], index) => ({
      name,
      value,
      color: AGE_COLORS[index],
    }));
    setOfficerAgeData(ageData);

    // State name normalization map
    const stateAbbreviations: Record<string, string> = {
      'al': 'Alabama', 'ak': 'Alaska', 'az': 'Arizona', 'ar': 'Arkansas', 'ca': 'California',
      'co': 'Colorado', 'ct': 'Connecticut', 'de': 'Delaware', 'fl': 'Florida', 'ga': 'Georgia',
      'hi': 'Hawaii', 'id': 'Idaho', 'il': 'Illinois', 'in': 'Indiana', 'ia': 'Iowa',
      'ks': 'Kansas', 'ky': 'Kentucky', 'la': 'Louisiana', 'me': 'Maine', 'md': 'Maryland',
      'ma': 'Massachusetts', 'mi': 'Michigan', 'mn': 'Minnesota', 'ms': 'Mississippi', 'mo': 'Missouri',
      'mt': 'Montana', 'ne': 'Nebraska', 'nv': 'Nevada', 'nh': 'New Hampshire', 'nj': 'New Jersey',
      'nm': 'New Mexico', 'ny': 'New York', 'nc': 'North Carolina', 'nd': 'North Dakota', 'oh': 'Ohio',
      'ok': 'Oklahoma', 'or': 'Oregon', 'pa': 'Pennsylvania', 'ri': 'Rhode Island', 'sc': 'South Carolina',
      'sd': 'South Dakota', 'tn': 'Tennessee', 'tx': 'Texas', 'ut': 'Utah', 'vt': 'Vermont',
      'va': 'Virginia', 'wa': 'Washington', 'wv': 'West Virginia', 'wi': 'Wisconsin', 'wy': 'Wyoming',
      'dc': 'District of Columbia',
    };

    const normalizeState = (state: string): string => {
      const trimmed = state.trim().toLowerCase();
      // Check if it's an abbreviation
      if (stateAbbreviations[trimmed]) return stateAbbreviations[trimmed];
      // Check if it's already a full name (case-insensitive match)
      const fullName = Object.values(stateAbbreviations).find(name => name.toLowerCase() === trimmed);
      if (fullName) return fullName;
      // Capitalize first letter of each word as fallback
      return trimmed.replace(/\b\w/g, c => c.toUpperCase());
    };

    // Officer States Distribution
    const officerStates: Record<string, number> = {};
    allOfficers.forEach((officer) => {
      if (officer.address_state) {
        const normalized = normalizeState(officer.address_state);
        officerStates[normalized] = (officerStates[normalized] || 0) + 1;
      }
    });

    const STATE_COLORS = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
      '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#f43f5e'
    ];

    const officerStateChartData = Object.entries(officerStates)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value], index) => ({
        name,
        value,
        color: STATE_COLORS[index % STATE_COLORS.length],
      }));
    setOfficerStateData(officerStateChartData);

    // Company States Distribution
    const companyStates: Record<string, number> = {};
    allCompanies.forEach((company) => {
      if (company.company_state) {
        const normalized = normalizeState(company.company_state);
        companyStates[normalized] = (companyStates[normalized] || 0) + 1;
      }
    });

    const companyStateChartData = Object.entries(companyStates)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value], index) => ({
        name,
        value,
        color: STATE_COLORS[index % STATE_COLORS.length],
      }));
    setCompanyStateData(companyStateChartData);

    // Officer License Levels Distribution
    try {
      const { data: allCerts } = await supabase
        .from("certifications")
        .select("officer_id, license_level, certification_type")
        .eq("certification_type", "license")
        .not("license_level", "is", null);

      // Map license_level values to display names
      const levelMap: Record<string, string> = {
        'level-ii': 'Level 2 (Non-Commission)',
        'level-iii': 'Level 3 (Commission)',
        'level-iv': 'Level 4 (PPO)',
      };

      // Count unique officers per level
      const officerLevels: Record<string, Set<string>> = {};
      (allCerts || []).forEach((cert) => {
        const level = levelMap[cert.license_level] || cert.license_level;
        if (!officerLevels[level]) officerLevels[level] = new Set();
        officerLevels[level].add(cert.officer_id);
      });

      const LEVEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      const levelData = Object.entries(officerLevels)
        .map(([name, officers], index) => ({
          name,
          value: officers.size,
          color: LEVEL_COLORS[index % LEVEL_COLORS.length],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setOfficerLevelData(levelData);
    } catch (error) {
      console.error("Error loading license levels:", error);
      setOfficerLevelData([]);
    }
  };

  // Update pie charts when data changes
  useEffect(() => {
    if (analytics && allOfficers.length > 0) {
      preparePieChartData();
    }
  }, [analytics, allOfficers, allCompanies]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="analytics" className="w-full">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="browse">
              <Users className="h-4 w-4 mr-2" />
              Browse Officers
            </TabsTrigger>
            <TabsTrigger value="company-profiles">
              <Building2 className="h-4 w-4 mr-2" />
              Company Profiles
            </TabsTrigger>
            <TabsTrigger value="officers">All Officers</TabsTrigger>
            <TabsTrigger value="companies">All Companies</TabsTrigger>
            <TabsTrigger value="suspended">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Suspended Companies
            </TabsTrigger>
            <TabsTrigger value="users">
              <Shield className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">

        {/* Stats Overview */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalOfficers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalCompanies}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hires</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalHires}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profile Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalProfileViews}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pie Charts Section - Compact with dropdown selector */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5" />
                Analytics Charts
              </CardTitle>
              <Select value={selectedChart} onValueChange={setSelectedChart}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stats-overview">Stats Overview</SelectItem>
                  <SelectItem value="officer-age">Officer Age Groups</SelectItem>
                  <SelectItem value="officer-state">Officers by State</SelectItem>
                  <SelectItem value="company-state">Companies by State</SelectItem>
                  <SelectItem value="officer-level">Officers by License Level</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardDescription>
              {selectedChart === "stats-overview" && "Distribution of key metrics"}
              {selectedChart === "officer-age" && "Age distribution in 10-year increments"}
              {selectedChart === "officer-state" && "Geographic distribution of officers"}
              {selectedChart === "company-state" && "Geographic distribution of companies"}
              {selectedChart === "officer-level" && "Distribution of Level 2, 3, 4 officers"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const chartMap: Record<string, { data: any[]; label: string }> = {
                "stats-overview": { data: statsOverviewData, label: "" },
                "officer-age": { data: officerAgeData, label: "officers" },
                "officer-state": { data: officerStateData, label: "officers" },
                "company-state": { data: companyStateData, label: "companies" },
                "officer-level": { data: officerLevelData, label: "officers" },
              };
              const current = chartMap[selectedChart];
              if (!current || current.data.length === 0) {
                return <div className="text-center py-12 text-muted-foreground text-sm">No data available.</div>;
              }
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={current.data}
                      cx="50%"
                      cy="45%"
                      labelLine={false}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {current.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [`${value}${current.label ? ` ${current.label}` : ''}`, name]} />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      formatter={(value: string) => {
                        const total = current.data.reduce((sum, d) => sum + d.value, 0);
                        const item = current.data.find(d => d.name === value);
                        const pct = total > 0 && item ? ((item.value / total) * 100).toFixed(0) : 0;
                        return `${value}: ${item?.value || 0} (${pct}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Recent Officers */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Officers</CardTitle>
              <CardDescription>Latest security officer registrations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.recentOfficers.map((officer) => (
                  <div key={officer.id} className="flex justify-between items-start border-b pb-2">
                    <div>
                      <p className="font-medium">{officer.profiles?.full_name || "N/A"}</p>
                      <p className="text-sm text-muted-foreground">{officer.profiles?.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {calculateDaysOnSite(officer.profiles?.created_at)} days on site
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(officer.profiles?.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Companies */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Companies</CardTitle>
              <CardDescription>Latest company registrations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.recentCompanies.map((company) => (
                  <div key={company.id} className="flex justify-between items-start border-b pb-2">
                    <div>
                      <p className="font-medium">{company.company_name}</p>
                      <p className="text-sm text-muted-foreground">{company.profiles?.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {calculateDaysOnSite(company.profiles?.created_at)} days on site
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(company.profiles?.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Viewed Officers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top Viewed Officers
              </CardTitle>
              <CardDescription>Officers with most profile views</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.topViewedOfficers.map((officer, index) => (
                  <div 
                    key={officer.id} 
                    className="flex justify-between items-center border-b pb-2 hover:bg-accent/50 -mx-2 px-2 py-1 rounded cursor-pointer transition-colors"
                    onClick={() => navigate(`/browse?officer=${officer.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-muted-foreground">#{index + 1}</span>
                      <div>
                        <p className="font-medium">{officer.profiles?.full_name || "N/A"}</p>
                        <p className="text-sm text-muted-foreground">{officer.title || "Security Officer"}</p>
                      </div>
                    </div>
                    <span className="font-bold text-primary cursor-pointer hover:underline">{officer.view_count} views</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Hires */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Hires</CardTitle>
              <CardDescription>Latest successful placements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.recentHires.map((hire: any) => (
                  <div key={hire.id} className="border-b pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium">{hire.officer_profiles?.profiles?.full_name || "N/A"}</p>
                      <span className="text-xs text-muted-foreground">{formatDate(hire.hire_date)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Hired by: {hire.company_profiles?.company_name || "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Position: {hire.position_title || "Security Officer"}
                    </p>
                    <span className={`inline-block px-2 py-1 rounded text-xs mt-1 ${
                      hire.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {hire.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="browse">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Officer List */}
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle>Select Officer</CardTitle>
                  <CardDescription>Choose an officer to view and edit</CardDescription>
                  <div className="mt-4 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search officers..."
                      value={officerSearch}
                      onChange={(e) => setOfficerSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {filteredOfficers.map((officer) => (
                      <div
                        key={officer.id}
                        onClick={() => {
                          setSelectedOfficer(officer);
                          setEditingOfficer({ ...officer });
                          loadOfficerDetails(officer.id, officer.user_id);
                        }}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedOfficer?.id === officer.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <p className="font-medium">{officer.profiles?.full_name || "N/A"}</p>
                        <p className="text-sm text-muted-foreground">{officer.officer_number}</p>
                        <p className="text-xs text-muted-foreground">{officer.profiles?.email}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Officer Edit Form */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Officer Profile</CardTitle>
                  <CardDescription>View and edit officer information</CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedOfficer ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Select an officer from the list to view and edit their profile
                    </div>
                  ) : (
                    <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-4">
                      {/* Profile Photo */}
                      {selectedOfficer?.avatar_url && (
                        <div className="flex justify-center">
                          <img src={selectedOfficer.avatar_url} alt="Profile" className="w-32 h-32 rounded-full object-cover border-2" />
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Full Name</Label>
                          <Input value={selectedOfficer.profiles?.full_name || ""} disabled />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input value={selectedOfficer.profiles?.email || ""} disabled />
                        </div>
                        <div className="space-y-2">
                          <Label>Officer Number</Label>
                          <Input value={editingOfficer?.officer_number || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, officer_number: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={editingOfficer?.phone || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input value={editingOfficer?.title || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Date of Birth</Label>
                          <Input type="date" value={editingOfficer?.date_of_birth || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, date_of_birth: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Years Experience</Label>
                          <Input type="number" value={editingOfficer?.years_experience || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, years_experience: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Hourly Rate</Label>
                          <Input type="number" step="0.01" value={editingOfficer?.hourly_rate || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, hourly_rate: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Desired Salary</Label>
                          <Input type="number" step="0.01" value={editingOfficer?.desired_salary || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, desired_salary: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Availability Status</Label>
                          <Select value={editingOfficer?.availability_status || "available"} onValueChange={(value) => setEditingOfficer({ ...editingOfficer, availability_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="unavailable">Unavailable</SelectItem>
                              <SelectItem value="on_assignment">On Assignment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Account Status</Label>
                          <Select value={editingOfficer?.account_status || "active"} onValueChange={(value) => setEditingOfficer({ ...editingOfficer, account_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="paused">Paused</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="deleted">Deleted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Bio</Label>
                        <textarea
                          className="w-full min-h-[100px] px-3 py-2 border rounded-md"
                          value={editingOfficer?.bio || ""}
                          onChange={(e) => setEditingOfficer({ ...editingOfficer, bio: e.target.value })}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Street Address</Label>
                          <Input value={editingOfficer?.address_street || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_street: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit/Apt</Label>
                          <Input value={editingOfficer?.address_unit || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_unit: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input value={editingOfficer?.address_city || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_city: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>State</Label>
                          <Input value={editingOfficer?.address_state || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_state: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>ZIP Code</Label>
                          <Input value={editingOfficer?.address_zip || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_zip: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Country</Label>
                          <Input value={editingOfficer?.address_country || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, address_country: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Main Region</Label>
                          <Input value={editingOfficer?.main_region || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, main_region: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Input value={editingOfficer?.location || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, location: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>LinkedIn URL</Label>
                          <Input value={editingOfficer?.linkedin_url || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, linkedin_url: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Avatar URL</Label>
                          <Input value={editingOfficer?.avatar_url || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, avatar_url: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Resume URL</Label>
                          <Input value={editingOfficer?.resume_url || ""} onChange={(e) => setEditingOfficer({ ...editingOfficer, resume_url: e.target.value })} />
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <Button onClick={handleSaveOfficerProfile} disabled={savingProfile}>
                          {savingProfile ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button variant="outline" onClick={() => { setSelectedOfficer(null); setEditingOfficer(null); }}>
                          Cancel
                        </Button>
                      </div>

                      {/* Availability Schedule */}
                      {selectedOfficer?.availability_schedule && (
                        <div className="pt-4 border-t">
                          <h3 className="font-semibold mb-3">Weekly Availability</h3>
                          <div className="grid md:grid-cols-2 gap-2 text-sm">
                            {Object.entries(selectedOfficer.availability_schedule).map(([day, schedule]: [string, any]) => (
                              <div key={day} className="flex justify-between items-center p-2 border rounded">
                                <span className="font-medium capitalize">{day}</span>
                                <span className="text-muted-foreground">
                                  {schedule?.available ? `${schedule.start || '—'} - ${schedule.end || '—'}` : 'Unavailable'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Officer Photos */}
                      <div className="pt-4 border-t">
                        <h3 className="font-semibold mb-3">Photos ({Object.keys(officerPhotos).length})</h3>
                        {Object.keys(officerPhotos).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Object.entries(officerPhotos).map(([type, url]) => (
                              <div key={type} className="space-y-1">
                                <img src={url} alt={type} className="w-full h-40 object-cover rounded-lg border" />
                                <p className="text-xs text-muted-foreground capitalize text-center">{type.replace(/-/g, ' ')}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Certifications */}
                      <div className="pt-4 border-t">
                        <h3 className="font-semibold mb-3">Certifications ({officerCertifications.length})</h3>
                        {officerCertifications.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No certifications on file.</p>
                        ) : (
                          <div className="space-y-3">
                            {officerCertifications.map((cert) => (
                              <div key={cert.id} className="p-3 border rounded-lg">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium">{cert.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {cert.certification_type === 'license' ? 'License' : cert.certification_type === 'training' ? 'Training' : cert.certification_type}
                                      {cert.license_level && ` — ${cert.license_level}`}
                                    </p>
                                  </div>
                                  {cert.expiry_date && (
                                    <span className={`text-xs px-2 py-1 rounded ${new Date(cert.expiry_date) < new Date() ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                                      {new Date(cert.expiry_date) < new Date() ? 'Expired' : 'Active'}
                                    </span>
                                  )}
                                </div>
                                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                                    {cert.issuing_organization && <span>Issuer: {cert.issuing_organization}</span>}
                                    {cert.certification_number && <span>Cert #: {cert.certification_number}</span>}
                                    {cert.issue_date && <span>Issued: {new Date(cert.issue_date).toLocaleDateString()}</span>}
                                    {cert.expiry_date && <span>Expires: {new Date(cert.expiry_date).toLocaleDateString()}</span>}
                                    {cert.credential_id && <span>Credential ID: {cert.credential_id}</span>}
                                    {cert.description && <span className="col-span-2">Description: {cert.description}</span>}
                                  </div>
                                  {(cert.document_front_url || cert.document_back_url) && (
                                    <div className="flex gap-2 mt-2">
                                      {cert.document_front_url && (
                                        <a href={cert.document_front_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                                          View Document (Front)
                                        </a>
                                      )}
                                      {cert.document_back_url && (
                                        <a href={cert.document_back_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                                          View Document (Back)
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                        )}
                      </div>

                      {/* Work History */}
                      <div className="pt-4 border-t">
                        <h3 className="font-semibold mb-3">Work History ({officerWorkHistory.length})</h3>
                        {officerWorkHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No work history on file.</p>
                        ) : (
                          <div className="space-y-3">
                            {officerWorkHistory.map((job) => (
                              <div key={job.id} className="p-3 border rounded-lg">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium">{job.position_title || 'Position not specified'}</p>
                                    <p className="text-sm text-muted-foreground">{job.company_name}</p>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {job.start_date ? new Date(job.start_date).toLocaleDateString() : '—'} — {job.end_date ? new Date(job.end_date).toLocaleDateString() : 'Present'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                                  {job.company_city && <span>City: {job.company_city}{job.company_state ? `, ${job.company_state}` : ''}</span>}
                                  {job.company_phone && <span>Phone: {job.company_phone}</span>}
                                  {job.supervisor_name && <span>Supervisor: {job.supervisor_name}</span>}
                                  {job.supervisor_phone && <span>Supervisor Phone: {job.supervisor_phone}</span>}
                                  {job.reason_for_leaving && <span className="col-span-2">Reason for leaving: {job.reason_for_leaving}</span>}
                                </div>
                                {job.job_description && (
                                  <p className="text-xs text-muted-foreground mt-2">{job.job_description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="company-profiles">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Company List */}
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle>Select Company</CardTitle>
                  <CardDescription>Choose a company to view and edit</CardDescription>
                  <div className="mt-4 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {filteredCompanies.map((company) => (
                      <div
                        key={company.id}
                        onClick={() => {
                          setSelectedCompany(company);
                          setEditingCompany({ ...company });
                        }}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedCompany?.id === company.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <p className="font-medium">{company.company_name}</p>
                        <p className="text-sm text-muted-foreground">{company.company_number}</p>
                        <p className="text-xs text-muted-foreground">{company.profiles?.email}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Company Edit Form */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Company Profile</CardTitle>
                  <CardDescription>View and edit company information</CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedCompany ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Select a company from the list to view and edit their profile
                    </div>
                  ) : (
                    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input value={editingCompany?.company_name || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input value={selectedCompany.profiles?.email || ""} disabled />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Number</Label>
                          <Input value={editingCompany?.company_number || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_number: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company State</Label>
                          <Input value={editingCompany?.company_state || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_state: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Industry</Label>
                          <Input value={editingCompany?.industry || ""} onChange={(e) => setEditingCompany({ ...editingCompany, industry: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Size</Label>
                          <Input value={editingCompany?.company_size || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_size: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>License Number</Label>
                          <Input value={editingCompany?.license_number || ""} onChange={(e) => setEditingCompany({ ...editingCompany, license_number: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Website URL</Label>
                          <Input value={editingCompany?.website_url || ""} onChange={(e) => setEditingCompany({ ...editingCompany, website_url: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Person Name</Label>
                          <Input value={editingCompany?.contact_person_name || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contact_person_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Person Title</Label>
                          <Input value={editingCompany?.contact_person_title || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contact_person_title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Person Position</Label>
                          <Input value={editingCompany?.contact_person_position || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contact_person_position: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Email</Label>
                          <Input value={editingCompany?.contact_email || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contact_email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Cell Phone</Label>
                          <Input value={editingCompany?.contact_cell_phone || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contact_cell_phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Phone</Label>
                          <Input value={editingCompany?.company_phone || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Phone Extension</Label>
                          <Input value={editingCompany?.company_phone_ext || ""} onChange={(e) => setEditingCompany({ ...editingCompany, company_phone_ext: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Subscription Tier</Label>
                          <Select value={editingCompany?.subscription_tier || "free"} onValueChange={(value) => setEditingCompany({ ...editingCompany, subscription_tier: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Subscription Status</Label>
                          <Select value={editingCompany?.subscription_status || "free"} onValueChange={(value) => setEditingCompany({ ...editingCompany, subscription_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Status</Label>
                          <Select value={editingCompany?.payment_status || "current"} onValueChange={(value) => setEditingCompany({ ...editingCompany, payment_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="current">Current</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                              <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Account Status</Label>
                          <Select value={editingCompany?.account_status || "active"} onValueChange={(value) => setEditingCompany({ ...editingCompany, account_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="paused">Paused</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="deleted">Deleted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Due Date</Label>
                          <Input type="date" value={editingCompany?.payment_due_date || ""} onChange={(e) => setEditingCompany({ ...editingCompany, payment_due_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Last Payment Date</Label>
                          <Input type="date" value={editingCompany?.last_payment_date || ""} onChange={(e) => setEditingCompany({ ...editingCompany, last_payment_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Trial Start Date</Label>
                          <Input type="datetime-local" value={editingCompany?.trial_start_date?.slice(0, 16) || ""} onChange={(e) => setEditingCompany({ ...editingCompany, trial_start_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Trial End Date</Label>
                          <Input type="datetime-local" value={editingCompany?.trial_end_date?.slice(0, 16) || ""} onChange={(e) => setEditingCompany({ ...editingCompany, trial_end_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Subscription Start Date</Label>
                          <Input type="datetime-local" value={editingCompany?.subscription_start_date?.slice(0, 16) || ""} onChange={(e) => setEditingCompany({ ...editingCompany, subscription_start_date: e.target.value })} />
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <Button onClick={handleSaveCompanyProfile} disabled={savingProfile}>
                          {savingProfile ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button variant="outline" onClick={() => { setSelectedCompany(null); setEditingCompany(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="officers">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Security Officers</CardTitle>
                    <CardDescription>Complete list of registered security officers</CardDescription>
                  </div>
                  <Button onClick={downloadOfficersCSV} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or officer number..."
                    value={officerSearch}
                    onChange={(e) => setOfficerSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Officer #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOfficers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No officers found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOfficers.map((officer) => (
                      <TableRow key={officer.id}>
                        <TableCell className="font-medium">{officer.profiles?.full_name || "N/A"}</TableCell>
                        <TableCell>{officer.profiles?.email}</TableCell>
                        <TableCell>{officer.officer_number || "N/A"}</TableCell>
                        <TableCell>{officer.title || "N/A"}</TableCell>
                        <TableCell>{officer.location || "N/A"}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            officer.account_status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : officer.account_status === 'paused'
                              ? 'bg-yellow-100 text-yellow-800'
                              : officer.account_status === 'cancelled'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {officer.account_status || "active"}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(officer.profiles?.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" disabled={resettingPassword}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Reset Password
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reset Password</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Send a password reset email to {officer.profiles?.full_name || "this officer"} at {officer.profiles?.email}?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handlePasswordReset(officer.profiles?.email, officer.profiles?.full_name || "Officer")}>
                                    <Mail className="h-4 w-4 mr-2" />
                                    Send Reset Email
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedUserId(officer.user_id);
                                setSelectedUserEmail(officer.profiles?.email || "");
                                setManualResetDialogOpen(true);
                              }}
                            >
                              <Shield className="h-4 w-4 mr-2" />
                              Set Password
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(officer.user_id, 'paused', 'officer_profiles', officer.profiles?.full_name || "Officer")}
                                  disabled={officer.account_status === 'paused'}
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(officer.user_id, 'cancelled', 'officer_profiles', officer.profiles?.full_name || "Officer")}
                                  disabled={officer.account_status === 'cancelled'}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(officer.user_id, 'deleted', 'officer_profiles', officer.profiles?.full_name || "Officer")}
                                  disabled={officer.account_status === 'deleted'}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(officer.user_id, 'active', 'officer_profiles', officer.profiles?.full_name || "Officer")}
                                  disabled={officer.account_status === 'active'}
                                >
                                  <PlayCircle className="h-4 w-4 mr-2" />
                                  Reactivate Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Companies</CardTitle>
                    <CardDescription>Complete list of registered companies</CardDescription>
                  </div>
                  <Button onClick={downloadCompaniesCSV} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by company name, email, or company number..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company #</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No companies found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">{company.company_name}</TableCell>
                        <TableCell>{company.profiles?.email}</TableCell>
                        <TableCell>{company.company_number || "N/A"}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            company.subscription_tier === 'premium' 
                              ? 'bg-primary/20 text-primary' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {company.subscription_tier || "free"}
                          </span>
                        </TableCell>
                        <TableCell>{company.contact_person_name || "N/A"}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            company.account_status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : company.account_status === 'paused'
                              ? 'bg-yellow-100 text-yellow-800'
                              : company.account_status === 'cancelled'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {company.account_status || "active"}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(company.profiles?.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" disabled={resettingPassword}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Reset Password
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reset Password</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Send a password reset email to {company.company_name} at {company.profiles?.email}?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handlePasswordReset(company.profiles?.email, company.company_name)}>
                                    <Mail className="h-4 w-4 mr-2" />
                                    Send Reset Email
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(company.user_id, 'paused', 'company_profiles', company.company_name)}
                                  disabled={company.account_status === 'paused'}
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(company.user_id, 'cancelled', 'company_profiles', company.company_name)}
                                  disabled={company.account_status === 'cancelled'}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(company.user_id, 'deleted', 'company_profiles', company.company_name)}
                                  disabled={company.account_status === 'deleted'}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Account
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleAccountStatusChange(company.user_id, 'active', 'company_profiles', company.company_name)}
                                  disabled={company.account_status === 'active'}
                                >
                                  <PlayCircle className="h-4 w-4 mr-2" />
                                  Reactivate Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suspended">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Suspended Companies
                    </CardTitle>
                    <CardDescription>Companies suspended for non-payment or overdue bills</CardDescription>
                  </div>
                  <Button onClick={downloadSuspendedCSV} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search suspended companies..."
                    value={suspendedSearch}
                    onChange={(e) => setSuspendedSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company #</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Last Payment</TableHead>
                      <TableHead>Days Overdue</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuspended.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          {suspendedCompanies.length === 0 
                            ? "No suspended companies" 
                            : "No companies found matching your search"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSuspended.map((company) => {
                        const daysOverdue = company.payment_due_date 
                          ? Math.floor((Date.now() - new Date(company.payment_due_date).getTime()) / (1000 * 60 * 60 * 24))
                          : 0;
                        
                        return (
                          <TableRow key={company.id} className="bg-destructive/5">
                            <TableCell className="font-medium">{company.company_name}</TableCell>
                            <TableCell>{company.profiles?.email}</TableCell>
                            <TableCell>{company.company_number || "N/A"}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-semibold">
                                {company.payment_status || "overdue"}
                              </span>
                            </TableCell>
                            <TableCell>{company.payment_due_date ? formatDate(company.payment_due_date) : "N/A"}</TableCell>
                            <TableCell>{company.last_payment_date ? formatDate(company.last_payment_date) : "Never"}</TableCell>
                            <TableCell>
                              <span className="font-bold text-destructive">
                                {daysOverdue > 0 ? `${daysOverdue} days` : "Due today"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" disabled={resettingPassword}>
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset Password
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reset Password</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Send a password reset email to {company.company_name} at {company.profiles?.email}?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handlePasswordReset(company.profiles?.email, company.company_name)}>
                                        <Mail className="h-4 w-4 mr-2" />
                                        Send Reset Email
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onClick={() => handleAccountStatusChange(company.user_id, 'active', 'company_profiles', company.company_name)}
                                      className="text-green-600"
                                    >
                                      <PlayCircle className="h-4 w-4 mr-2" />
                                      Reactivate Account
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleAccountStatusChange(company.user_id, 'deleted', 'company_profiles', company.company_name)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Account
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Tabs defaultValue="invite" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="invite">Invite Users</TabsTrigger>
                <TabsTrigger value="create">Create User</TabsTrigger>
                <TabsTrigger value="permissions">Admin Permissions</TabsTrigger>
              </TabsList>

              <TabsContent value="invite">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Mail className="h-5 w-5" />
                          Invite Users via Email
                        </CardTitle>
                        <CardDescription>Send email invitations to new users</CardDescription>
                      </div>
                      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite New User</DialogTitle>
                        <DialogDescription>
                          Add a new user with specific access permissions
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="user@example.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="full_name">Full Name</Label>
                          <Input
                            id="full_name"
                            placeholder="John Doe"
                            value={inviteFullName}
                            onChange={(e) => setInviteFullName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="role">Access Level *</Label>
                          <Select value={inviteRole} onValueChange={setInviteRole}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view_only">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">View Only</span>
                                  <span className="text-xs text-muted-foreground">Can view officers and companies only</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="full_access">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">Full Access</span>
                                  <span className="text-xs text-muted-foreground">Can view and edit everything (except user management)</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">Administrator</span>
                                  <span className="text-xs text-muted-foreground">Full control including user management</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleInviteUser} disabled={inviting}>
                          {inviting ? "Sending..." : "Send Invitation"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead>Added On</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No admin users found. Click "Invite User" to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminUsers.map((userRole) => {
                        const roleLabels: Record<string, { label: string; description: string; color: string }> = {
                          admin: { label: "Administrator", description: "Full control", color: "bg-red-100 text-red-800" },
                          full_access: { label: "Full Access", description: "Can edit all data", color: "bg-blue-100 text-blue-800" },
                          view_only: { label: "View Only", description: "Read-only access", color: "bg-gray-100 text-gray-800" },
                        };
                        const roleInfo = roleLabels[userRole.role] || roleLabels.view_only;

                        return (
                          <TableRow key={userRole.id}>
                            <TableCell className="font-medium">{userRole.profiles?.email}</TableCell>
                            <TableCell>{userRole.profiles?.full_name || "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className={`px-2 py-1 rounded text-xs font-semibold w-fit ${roleInfo.color}`}>
                                  {roleInfo.label}
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">{roleInfo.description}</span>
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(userRole.created_at)}</TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove User Access</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove {roleInfo.label} access for {userRole.profiles?.email}? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleRemoveUserRole(userRole.user_id, userRole.id, userRole.profiles?.email)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Remove Access
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Create User Manually
                    </CardTitle>
                    <CardDescription>Create a new user with username and password</CardDescription>
                  </div>
                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create New User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New User</DialogTitle>
                        <DialogDescription>
                          Manually create a new user with login credentials
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="create_email">Email *</Label>
                          <Input
                            id="create_email"
                            type="email"
                            placeholder="user@example.com"
                            value={createEmail}
                            onChange={(e) => setCreateEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create_password">Password *</Label>
                          <Input
                            id="create_password"
                            type="password"
                            placeholder="Minimum 6 characters"
                            value={createPassword}
                            onChange={(e) => setCreatePassword(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create_username">Username</Label>
                          <Input
                            id="create_username"
                            placeholder="johndoe"
                            value={createUsername}
                            onChange={(e) => setCreateUsername(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create_full_name">Full Name</Label>
                          <Input
                            id="create_full_name"
                            placeholder="John Doe"
                            value={createFullName}
                            onChange={(e) => setCreateFullName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create_role">Access Level *</Label>
                          <Select value={createRole} onValueChange={setCreateRole}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view_only">View Only</SelectItem>
                              <SelectItem value="full_access">Full Access</SelectItem>
                              <SelectItem value="admin">Administrator</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateUser} disabled={creating}>
                          {creating ? "Creating..." : "Create User"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-8">
                  Click "Create New User" to manually add users with username and password
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Admin Permissions
                </CardTitle>
                <CardDescription>Manage user accounts, pause access, and reset passwords</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminUsers.map((userRole) => {
                        const roleLabels: Record<string, { label: string; color: string }> = {
                          admin: { label: "Administrator", color: "bg-red-100 text-red-800" },
                          full_access: { label: "Full Access", color: "bg-blue-100 text-blue-800" },
                          view_only: { label: "View Only", color: "bg-gray-100 text-gray-800" },
                        };
                        const roleInfo = roleLabels[userRole.role] || roleLabels.view_only;

                        return (
                          <TableRow key={userRole.id}>
                            <TableCell className="font-medium">{userRole.profiles?.email}</TableCell>
                            <TableCell>{userRole.profiles?.full_name || "N/A"}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${roleInfo.color}`}>
                                {roleInfo.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset via Email
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Send Password Reset Email</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Send a password reset email to {userRole.profiles?.email}?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handlePasswordReset(userRole.profiles?.email, userRole.profiles?.full_name || userRole.profiles?.email)}>
                                        Send Email
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUserId(userRole.user_id);
                                    setSelectedUserEmail(userRole.profiles?.email || "");
                                    setManualResetDialogOpen(true);
                                  }}
                                >
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Manual Reset
                                </Button>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onClick={() => handlePauseUser(userRole.user_id, userRole.profiles?.email || "", true)}
                                      className="text-amber-600"
                                    >
                                      <Pause className="h-4 w-4 mr-2" />
                                      Pause Account
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handlePauseUser(userRole.user_id, userRole.profiles?.email || "", false)}
                                      className="text-green-600"
                                    >
                                      <PlayCircle className="h-4 w-4 mr-2" />
                                      Unpause Account
                                    </DropdownMenuItem>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem 
                                          onSelect={(e) => e.preventDefault()}
                                          className="text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete Account
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete User Account</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Permanently delete the account for {userRole.profiles?.email}? This action cannot be undone and will remove all associated data.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => handleDeleteUser(userRole.user_id, userRole.profiles?.email || "")}
                                            className="bg-destructive text-destructive-foreground"
                                          >
                                            Delete Account
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </TabsContent>

        <Dialog open={manualResetDialogOpen} onOpenChange={setManualResetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manually Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {selectedUserEmail}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <Input
                  id="new_password"
                  type="password"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setManualResetDialogOpen(false);
                setNewPassword("");
                setSelectedUserId("");
                setSelectedUserEmail("");
              }}>
                Cancel
              </Button>
              <Button onClick={handleManualPasswordReset} disabled={updatingPassword}>
                {updatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
