// ==========================================================================
// Home Page - War Room Case Taxonomy Portal
// Main dashboard with navigation to case list, case entry, insights, and chatbot
// Auth: Simulated SSO user header (production: replace with Entra ID SSO)
// ==========================================================================
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CaseForm } from '@/components/case-form';
import { CaseList } from '@/components/case-list';
import { ChatSidebar } from '@/components/chat-sidebar';
import { InsightsPage } from '@/components/insights-page';
import { getDashboardStats } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import type { DashboardStats } from '@/types/case';
import {
  ClipboardList,
  PlusCircle,
  MessageSquare,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Lightbulb,
  User,
  LogOut,
  Loader2,
} from 'lucide-react';

type ActiveView = 'dashboard' | 'new-case' | 'case-list' | 'insights';

export default function HomePage() {
  // --------------------------------------------------------------------------
  // Auth (Entra ID SSO via Azure Static Web Apps)
  // --------------------------------------------------------------------------
  const { user, loading: authLoading, logout } = useAuth();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // --------------------------------------------------------------------------
  // Load dashboard stats on mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function loadStats() {
      try {
        setStatsLoading(true);
        const response = await getDashboardStats();
        if (response.success && response.data) {
          setStats(response.data);
        }
      } catch (error) {
        console.error('[Dashboard] Failed to load stats:', error);
        // Set fallback stats so UI still renders
        setStats({
          totalCases: 0,
          reviewedCases: 0,
          pendingCases: 0,
          idleCases: 0,
          casesByType: {},
          casesByIssueType: {},
          avgResolutionBySource: {},
        });
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, [activeView]); // Refresh stats when switching back to dashboard

  // --------------------------------------------------------------------------
  // Auth loading screen
  // --------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================== */}
      {/* Top Navigation Bar */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo / Title */}
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">War Room Case Taxonomy</h1>
              <p className="text-xs text-muted-foreground">CXP Auditing Portal</p>
            </div>
          </div>

          {/* Navigation Buttons */}
          <nav className="flex items-center gap-2">
            <Button
              variant={activeView === 'dashboard' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('dashboard')}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button
              variant={activeView === 'new-case' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('new-case')}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New Case
            </Button>
            <Button
              variant={activeView === 'case-list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('case-list')}
            >
              <FileText className="mr-2 h-4 w-4" />
              All Cases
            </Button>
            <Button
              variant={activeView === 'insights' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('insights')}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Insights
            </Button>

            {/* Chatbot Toggle */}
            <div className="ml-4 border-l pl-4">
              <Button
                variant={chatOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => setChatOpen(!chatOpen)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                AI Assistant
              </Button>
            </div>

            {/* User Profile (Entra ID SSO) */}
            {user && (
              <div className="ml-2 flex items-center gap-2 pl-4 border-l">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="hidden md:block">
                  <p className="text-xs font-medium leading-none">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="h-7 w-7 p-0 ml-1"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* ================================================================== */}
      {/* Main Content Area with optional Chat Sidebar */}
      {/* ================================================================== */}
      <div className="flex">
        {/* Main content - adjusts width when chat is open */}
        <main className={`flex-1 transition-all duration-300 ${chatOpen ? 'mr-[400px]' : ''}`}>
          <div className="container py-6">
            {/* Dashboard View */}
            {activeView === 'dashboard' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                  <p className="text-muted-foreground">
                    Overview of war room case audit metrics and taxonomy distribution.
                  </p>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.totalCases ?? 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Reviewed</CardTitle>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.reviewedCases ?? 0}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats && stats.totalCases > 0
                          ? `${Math.round((stats.reviewedCases / stats.totalCases) * 100)}% completion`
                          : 'No data'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                      <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.pendingCases ?? 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Idle {'>'} 8hrs</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.idleCases ?? 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Case Type & Issue Type Distribution */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Cases by Type</CardTitle>
                      <CardDescription>Distribution across case types</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {stats && Object.keys(stats.casesByType).length > 0 ? (
                        <div className="space-y-3">
                          {Object.entries(stats.casesByType).map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between">
                              <span className="text-sm">{type}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {statsLoading ? 'Loading...' : 'No data available yet'}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Cases by Issue Type</CardTitle>
                      <CardDescription>Distribution across issue categories</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {stats && Object.keys(stats.casesByIssueType).length > 0 ? (
                        <div className="space-y-3">
                          {Object.entries(stats.casesByIssueType).map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between">
                              <span className="text-sm">{type}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {statsLoading ? 'Loading...' : 'No data available yet'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-3">
                    <Button onClick={() => setActiveView('new-case')}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create New Case
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('case-list')}>
                      <FileText className="mr-2 h-4 w-4" />
                      View All Cases
                    </Button>
                    <Button variant="outline" onClick={() => setChatOpen(true)}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Ask AI Assistant
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* New Case Form View */}
            {activeView === 'new-case' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Case Information</h2>
                  <p className="text-muted-foreground">
                    Fill in all taxonomy fields for a war room case.
                  </p>
                </div>
                <CaseForm
                  userName={user?.name || ''}
                  onSuccess={() => {
                    // Navigate to case list after successful creation
                    setActiveView('case-list');
                  }}
                />
              </div>
            )}

            {/* Case List View */}
            {activeView === 'case-list' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">All Cases</h2>
                    <p className="text-muted-foreground">
                      Browse, search, and manage all war room cases.
                    </p>
                  </div>
                  <Button onClick={() => setActiveView('new-case')}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Case
                  </Button>
                </div>
                <CaseList />
              </div>
            )}

            {/* Insights View */}
            {activeView === 'insights' && (
              <InsightsPage />
            )}
          </div>
        </main>

        {/* Chat Sidebar - Agentic Chatbot */}
        {chatOpen && (
          <ChatSidebar onClose={() => setChatOpen(false)} />
        )}
      </div>
    </div>
  );
}
