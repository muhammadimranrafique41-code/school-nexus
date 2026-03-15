import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Share2, Download, Loader2, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useUser } from '@/hooks/use-auth';
import { ClassSelector } from './components/class-selector';
import { DatePicker } from './components/date-picker';
import { DiaryTable } from './components/diary-table';

export default function HomeworkDiaryPage() {
  const { data: user, isLoading: userLoading } = useUser();

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-slate-400" size={32} />
            <p className="text-slate-600">Loading...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="p-8 max-w-md text-center">
          <Lock className="mx-auto mb-4 text-red-500" size={48} />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">You do not have permission to access this page.</p>
        </Card>
      </div>
    );
  }

  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Array<{
    subject: string;
    topic: string;
    note?: string;
  }>>([]);
  const [diaryId, setDiaryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');

  // Subject color mapping
  const subjectColors: Record<string, { badge: string; text: string }> = {
    'Urdu': { badge: 'bg-purple-100', text: 'text-purple-700' },
    'English': { badge: 'bg-blue-100', text: 'text-blue-700' },
    'Math': { badge: 'bg-orange-100', text: 'text-orange-700' },
    'Mathematics': { badge: 'bg-orange-100', text: 'text-orange-700' },
    'Islamiat': { badge: 'bg-green-100', text: 'text-green-700' },
    'Science': { badge: 'bg-red-100', text: 'text-red-700' },
    'Social Studies': { badge: 'bg-indigo-100', text: 'text-indigo-700' },
    'Physical Education': { badge: 'bg-yellow-100', text: 'text-yellow-700' },
  };

  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  // Load diary on date/class change
  React.useEffect(() => {
    if (!selectedClass) return;
    
    const loadDiary = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/homework-diary/${selectedClass}/${dateStr}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setDiaryId(data.id);
            setEntries(data.entries || []);
            setStatus(data.status || 'draft');
          } else {
            setDiaryId(null);
            setEntries([]);
            setStatus('draft');
          }
        }
      } catch (err) {
        console.error('Failed to load diary:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDiary();
  }, [selectedClass, dateStr]);

  const handleAddEntry = () => {
    setEntries([...entries, { subject: '', topic: '', note: '' }]);
  };

  const handleUpdateEntry = (index: number, field: string, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    if (!selectedClass) return;
    setLoading(true);

    try {
      if (diaryId) {
        // Update existing
        const response = await fetch(`/api/admin/homework-diary/${diaryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries, status: 'draft' }),
        });
        if (response.ok) {
          setStatus('draft');
        }
      } else {
        // Create new
        const response = await fetch('/api/admin/homework-diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (response.ok) {
          const data = await response.json();
          setDiaryId(data.id);
          setStatus('draft');
        }
      }
    } catch (err) {
      console.error('Failed to save draft:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!diaryId) {
      // Create and publish
      setLoading(true);
      try {
        const response = await fetch('/api/admin/homework-diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (response.ok) {
          const data = await response.json();
          setDiaryId(data.id);
          publishDiary(data.id);
        }
      } finally {
        setLoading(false);
      }
    } else {
      publishDiary(diaryId);
    }
  };

  const publishDiary = async (id: number) => {
    setPublishing(true);
    try {
      const response = await fetch(`/api/admin/homework-diary/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      if (response.ok) {
        setStatus('published');
        // Trigger confetti animation
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        
        // Broadcast to WebSocket/SSE (if available)
        window.dispatchEvent(new CustomEvent('homework-diary-published', {
          detail: { classId: selectedClass, date: dateStr }
        }));
      }
    } catch (err) {
      console.error('Failed to publish diary:', err);
    } finally {
      setPublishing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <header className="text-center space-y-0.5 mb-8">
        <h1 className="text-4xl font-extrabold tracking-wide uppercase text-gray-900">
          Daily Homework Diary
        </h1>
        <p className="text-lg text-gray-600">Manage and publish homework assignments for your classes</p>
      </header>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Class</label>
          <ClassSelector value={selectedClass} onChange={setSelectedClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
          <DatePicker value={selectedDate} onChange={setSelectedDate} />
        </div>
        <div className="flex items-end">
          <div className="py-2 px-3 bg-gray-100 rounded-md text-sm font-semibold text-gray-700">
            Status: <span className={status === 'published' ? 'text-green-600' : 'text-yellow-600'}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {!selectedClass ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600 mb-4">Select a class to begin creating homework diary entries</p>
          <ClassSelector value={selectedClass} onChange={setSelectedClass} />
        </Card>
      ) : loading ? (
        <Card className="p-12 text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
          <p className="text-gray-600">Loading diary...</p>
        </Card>
      ) : (
        <>
          {/* Diary Table */}
          <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <DiaryTable
              entries={entries}
              onUpdateEntry={handleUpdateEntry}
              onRemoveEntry={handleRemoveEntry}
              subjectColors={subjectColors}
            />
          </div>

          {/* Add Entry Button */}
          <div className="mb-8">
            <Button
              onClick={handleAddEntry}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus size={18} />
              Add Subject
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 flex-wrap">
            <Button
              onClick={handlePrint}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download size={18} />
              Print / PDF
            </Button>
            <Button
              onClick={handleSaveDraft}
              variant="outline"
              disabled={loading || !entries.length}
            >
              {loading ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={handlePublish}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              disabled={publishing || !entries.length}
            >
              {publishing ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Publishing...
                </>
              ) : (
                <>
                  <Share2 size={18} />
                  Publish to All Students
                </>
              )}
            </Button>
          </div>

          {/* Print Styles */}
          <style>{`
            @media print {
              body { background: white; }
              .bg-gray-50, .bg-gray-100 { background: white; }
              .shadow-sm, .border { border: 1px solid #e5e7eb; }
              .print\\:hidden { display: none; }
              button, .flex.justify-end { display: none; }
              header { margin-bottom: 16px; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
