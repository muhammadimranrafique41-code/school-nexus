import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, BookOpen, Lock } from 'lucide-react';
import { useUser } from '@/hooks/use-auth';
import { useHomeworkDiaryPublishListener } from '@/hooks/use-homework-diary-socket';

interface DiaryEntry {
  subject: string;
  topic: string;
  note?: string;
}

interface HomeworkDiary {
  id: number;
  classId: number;
  date: string;
  entries: DiaryEntry[];
  status: 'draft' | 'published';
}

const subjectColors: Record<string, { background: string; border: string; text: string; icon: string }> = {
  'Urdu': { background: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: '📖' },
  'English': { background: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '📚' },
  'Math': { background: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '🔢' },
  'Mathematics': { background: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '🔢' },
  'Islamiat': { background: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '☪️' },
  'Science': { background: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '🔬' },
  'Social Studies': { background: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', icon: '🌍' },
  'Physical Education': { background: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '⚽' },
};

export default function StudentHomeworkDiaryPage() {
  const { data: user, isLoading: userLoading } = useUser();
  const [diaries, setDiaries] = useState<HomeworkDiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [classId, setClassId] = useState<number | null>(null);

  // Listen for real-time publish events
  useHomeworkDiaryPublishListener(classId, (publishedDiary: HomeworkDiary) => {
    setDiaries((prev) => {
      const existing = prev.find((d) => d.id === publishedDiary.id);
      if (existing) {
        return prev.map((d) => (d.id === publishedDiary.id ? publishedDiary : d));
      }
      return [publishedDiary, ...prev];
    });
    
    // Show a notification when new diary is published
    if (Notification?.permission === 'granted') {
      new Notification('New Homework Assigned!', {
        body: `Check your homework diary for ${format(parseISO(publishedDiary.date), 'MMMM d, yyyy')}`,
        icon: '📚',
      });
    }
  });

  useEffect(() => {
    if (!user?.className) {
      setLoading(false);
      return;
    }

    const fetchDiaries = async () => {
      try {
        // Get class ID from class name - in a real app, this would come from the API
        const classResponse = await fetch(`/api/v1/classes?grade=${user.className}`);
        if (classResponse.ok) {
          const classData = await classResponse.json();
          const id = classData.data[0]?.id;
          setClassId(id);
          
          if (id) {
            const response = await fetch(`/api/homework-diary/class/${id}`);
            if (response.ok) {
              const data = await response.json();
              setDiaries(data);
              // Select the most recent diary
              if (data.length > 0) {
                setSelectedDate(data[0].date);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch homework diaries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiaries();

    // Request notification permission
    if (Notification?.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Auto-refresh every 30 seconds if enabled
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchDiaries, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user?.className, autoRefresh]);

  const selectedDiary = diaries.find((d) => d.date === selectedDate);

  const getSubjectStyle = (subject: string) => {
    return subjectColors[subject] || {
      background: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-700',
      icon: '📝',
    };
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const currentIndex = diaries.findIndex((d) => d.date === selectedDate);
    if (direction === 'next' && currentIndex > 0) {
      setSelectedDate(diaries[currentIndex - 1].date);
    } else if (direction === 'prev' && currentIndex < diaries.length - 1) {
      setSelectedDate(diaries[currentIndex + 1].date);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <div className="p-8 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
            <p className="text-gray-600">Authenticating...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-12 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
            <p className="text-gray-600">Loading homework diaries...</p>
          </Card>
        </div>
      </div>
    );
  }

  if (diaries.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <header className="text-center space-y-2 mb-12">
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 flex items-center justify-center gap-3">
              <BookOpen size={36} className="text-indigo-600" />
              Your Homework Diary
            </h1>
            <p className="text-gray-600">Check back soon for homework updates</p>
          </header>

          <Card className="p-12 text-center">
            <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No homework assigned yet</h2>
            <p className="text-gray-500">Your instructors will post homework assignments here</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="text-center space-y-2 mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 flex items-center justify-center gap-3">
            <BookOpen size={36} className="text-indigo-600" />
            Your Homework Diary
          </h1>
          <p className="text-gray-600">
            Class: <span className="font-semibold">{user.className}</span>
          </p>
        </header>

        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={() => navigateDate('prev')}
            variant="outline"
            disabled={diaries.length === 0 || diaries.findIndex((d) => d.date === selectedDate) === diaries.length - 1}
            size="sm"
          >
            <ChevronLeft size={18} />
            Older
          </Button>

          <div className="text-center">
            {selectedDiary && (
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {format(parseISO(selectedDiary.date), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-gray-500">
                  {diaries.length} diaries available
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={() => navigateDate('next')}
            variant="outline"
            disabled={diaries.length === 0 || diaries.findIndex((d) => d.date === selectedDate) === 0}
            size="sm"
          >
            Newer
            <ChevronRight size={18} />
          </Button>
        </div>

        {/* Auto-refresh toggle */}
        <div className="flex justify-end mb-6">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className={autoRefresh ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {autoRefresh ? '🔄 Auto-refresh ON' : '⊘ Auto-refresh OFF'}
          </Button>
        </div>

        {/* Entries */}
        {selectedDiary && selectedDiary.entries.length > 0 ? (
          <div className="space-y-4">
            {selectedDiary.entries.map((entry, index) => {
              const style = getSubjectStyle(entry.subject);
              return (
                <Card
                  key={index}
                  className={`p-6 border-l-4 ${style.background} ${style.border} hover:shadow-md transition-shadow`}
                >
                  <div className="flex gap-4">
                    <div className="text-3xl">{style.icon}</div>
                    <div className="flex-1">
                      <h3 className={`text-lg font-bold ${style.text} mb-2`}>{entry.subject}</h3>
                      <p className="text-gray-800 text-base leading-relaxed mb-3">{entry.topic}</p>
                      {entry.note && (
                        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                          <p className="text-sm text-gray-600">📌 {entry.note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-gray-500">No homework for this date</p>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Last updated: {new Date().toLocaleTimeString()}</p>
          <p className="mt-2">
            💡 Tip: Bookmark this page to check your homework assignments anytime
          </p>
        </div>
      </div>
    </div>
  );
}
