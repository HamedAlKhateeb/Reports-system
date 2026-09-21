'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useProject } from '@/lib/project-context';
import type { ProjectItem } from '@/lib/projects-types';
import {
  FolderGit2,
  Users,
  Plus,
  Trash2,
  Check,
  ArrowRight,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PageLoading } from '@/components/ui/loading';

export function ProjectManagement() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const { user } = useAuth();
  const {
    projects,
    activeProject,
    team,
    userRole,
    loading,
    setActiveProject,
    refreshProjects,
    createNewProject,
    renameProject,
    deleteProjectById,
  } = useProject();

  // Create Project Dialog
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename Project Dialog
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [projectToRename, setProjectToRename] = useState<ProjectItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameDesc, setRenameDesc] = useState('');
  const [renaming, setRenaming] = useState(false);

  const handleStartRename = (proj: ProjectItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setProjectToRename(proj);
    setRenameName(proj.name);
    setRenameDesc(proj.description || '');
    setShowRenameModal(true);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToRename || !renameName.trim()) {
      toast.error(isAr ? 'يرجى كتابة اسم المشروع' : 'Please enter project name');
      return;
    }
    try {
      setRenaming(true);
      await renameProject(projectToRename.id, renameName.trim(), renameDesc.trim());
      setShowRenameModal(false);
      setProjectToRename(null);
      toast.success(isAr ? 'تمت إعادة تسمية المشروع بنجاح' : 'Project renamed successfully');
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل إعادة تسمية المشروع' : 'Failed to rename project'));
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteProject = async (proj: ProjectItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (proj.id === 'proj_default') {
      toast.error(isAr ? 'لا يمكن حذف المشروع الرئيسي الافتراضي' : 'Default project cannot be deleted');
      return;
    }
    const ok = window.confirm(
      isAr
        ? `هل أنت متأكد من حذف مشروع «${proj.name}» نهائياً؟ سيتم حذف جميع بيانات الفريق الخاصة به ولا يمكن التراجع.`
        : `Are you sure you want to permanently delete project "${proj.name}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteProjectById(proj.id);
      toast.success(isAr ? 'تم حذف المشروع بنجاح' : 'Project deleted successfully');
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل حذف المشروع' : 'Failed to delete project'));
    }
  };

  const isOwner = userRole === 'owner';

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      toast.error(isAr ? 'يرجى كتابة اسم المشروع' : 'Please enter project name');
      return;
    }
    try {
      setCreating(true);
      await createNewProject(newProjectName.trim(), newProjectDesc.trim());
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      toast.success(isAr ? 'تم إنشاء المشروع بنجاح' : 'Project created successfully');
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل إنشاء المشروع' : 'Failed to create project'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <FolderGit2 className="h-7 w-7 text-primary" />
            <span>{isAr ? 'المشاريع' : 'Projects'}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? 'كل مشروع حاوية مستقلة لمجلداته وتقاريره ولوحات التتبع الخاصة به — افتح أي مشروع لعرض محتوياته.'
              : 'Each project is a container for its folders, reports and tracking boards — open any project to view its contents.'}
          </p>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span>{isAr ? 'مشروع جديد' : 'New Project'}</span>
        </Button>
      </div>

      {/* Projects Grid */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground">
          {isAr ? 'مشاريعك الحالية' : 'Your Projects'} ({projects.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const isActive = activeProject?.id === proj.id;
            const isProjOwner = proj.owner_id === user?.uid || proj.ownerUid === user?.uid;
            return (
              <Card
                key={proj.id}
                className={`transition-all cursor-pointer hover:border-primary/60 ${
                  isActive ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : ''
                }`}
                onClick={() => {
                  setActiveProject(proj);
                  router.push(`/projects/${proj.id}`);
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2 truncate">
                      <FolderGit2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{proj.name}</span>
                    </CardTitle>
                    {isActive ? (
                      <Badge variant="default" className="shrink-0 gap-1">
                        <Check className="h-3 w-3" />
                        <span>{isAr ? 'المشروع النشط' : 'Active'}</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        {isProjOwner ? (isAr ? 'المالك' : 'Owner') : (isAr ? 'عضو' : 'Member')}
                      </Badge>
                    )}
                  </div>
                  {proj.description && (
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {proj.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground flex items-center justify-between">
                  <span>
                    {isAr ? 'تاريخ الإنشاء: ' : 'Created: '}
                    {new Date(proj.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isProjOwner && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={isAr ? 'إعادة تسمية المشروع' : 'Rename project'}
                          onClick={(e) => handleStartRename(proj, e)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {proj.id !== 'proj_default' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title={isAr ? 'حذف المشروع' : 'Delete project'}
                            onClick={(e) => handleDeleteProject(proj, e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {!isActive && (
                      <span
                        onClick={() => {
                          setActiveProject(proj);
                          router.push(`/projects/${proj.id}`);
                        }}
                        className="text-primary font-medium hover:underline flex items-center gap-1 ms-1 cursor-pointer"
                      >
                        {isAr ? 'فتح' : 'Open'}
                        <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Active Project & Team Details */}
      {activeProject && (
        <div className="space-y-6 pt-4 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-xl border border-border">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {isAr ? 'المشروع الحالي:' : 'Current Project:'}
                </span>
                <span className="text-lg font-bold text-foreground">{activeProject.name}</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {userRole?.toUpperCase() || 'MEMBER'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">ID: {activeProject.id}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                onClick={() => router.push(`/projects/${activeProject.id}`)}
                size="sm"
                className="gap-1.5 shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{isAr ? 'فتح مساحة العمل' : 'Open Workspace'}</span>
              </Button>

              {isOwner && (
                <Button
                  onClick={(e) => handleStartRename(activeProject, e)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  title={isAr ? 'إعادة تسمية المشروع' : 'Rename Project'}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{isAr ? 'إعادة تسمية' : 'Rename'}</span>
                </Button>
              )}

              {isOwner && activeProject.id !== 'proj_default' && (
                <Button
                  onClick={(e) => handleDeleteProject(activeProject, e)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                  title={isAr ? 'حذف المشروع' : 'Delete Project'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'حذف المشروع' : 'Delete'}</span>
                </Button>
              )}

            </div>
          </div>

          {/* Team Members List (read-only) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>{isAr ? 'أعضاء فريق العمل' : 'Team Members'}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {isAr ? 'أعضاء هذا المشروع وأدوارهم.' : 'Members of this project and their roles.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المستخدم / البريد' : 'User / Email'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الدور' : 'Role'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الانضمام' : 'Joined'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {team?.members?.map((member) => {
                      const isSelf = member.userId === user?.uid || member.email.toLowerCase() === user?.email?.toLowerCase();
                      const isMemOwner = member.role === 'owner';
                      return (
                        <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
                              {member.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="truncate">{member.email}</span>
                              {isSelf && (
                                <span className="ms-1.5 text-[10px] text-muted-foreground font-normal">
                                  ({isAr ? 'أنت' : 'You'})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={isMemOwner ? 'default' : member.role === 'admin' ? 'secondary' : 'outline'}
                              className="capitalize font-mono text-[10px]"
                            >
                              {member.role}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(member.joinedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Project Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isAr ? 'إنشاء مشروع جديد' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {isAr
                ? 'سيتم إنشاء المشروع وتعيينك كمالك (Owner) مع مساحة مستقلة لمجلداته وتقاريره.'
                : 'You will be set as the Owner with an isolated space for its folders and reports.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'اسم المشروع *' : 'Project Name *'}
              </label>
              <Input
                required
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={isAr ? 'مثال: منصة التجارة الإلكترونية' : 'e.g. E-Commerce Platform'}
                dir="auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'وصف المشروع (اختياري)' : 'Project Description (Optional)'}
              </label>
              <Input
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder={isAr ? 'وصف موجز للمشروع وأهدافه' : 'Brief project overview'}
                dir="auto"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (isAr ? 'جاري الإنشاء…' : 'Creating…') : (isAr ? 'إنشاء المشروع' : 'Create Project')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Project Modal */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isAr ? 'إعادة تسمية المشروع' : 'Rename Project'}</DialogTitle>
            <DialogDescription>
              {isAr
                ? 'تعديل اسم ووصف المشروع مع الاحتفاظ بجميع بياناته.'
                : 'Edit project name and description without losing any data.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRename} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'اسم المشروع الجديد *' : 'New Project Name *'}
              </label>
              <Input
                required
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder={isAr ? 'اسم المشروع' : 'Project Name'}
                dir="auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'وصف المشروع' : 'Project Description'}
              </label>
              <Input
                value={renameDesc}
                onChange={(e) => setRenameDesc(e.target.value)}
                placeholder={isAr ? 'وصف موجز للمشروع' : 'Brief project description'}
                dir="auto"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowRenameModal(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={renaming}>
                {renaming ? (isAr ? 'جاري الحفظ…' : 'Saving…') : (isAr ? 'حفظ التعديلات' : 'Save Changes')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
