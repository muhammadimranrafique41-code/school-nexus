import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Entry {
  subject: string;
  topic: string;
  note?: string;
}

interface DiaryTableProps {
  entries: Entry[];
  onUpdateEntry: (index: number, field: string, value: string) => void;
  onRemoveEntry: (index: number) => void;
  subjectColors: Record<string, { badge: string; text: string }>;
}

export function DiaryTable({
  entries,
  onUpdateEntry,
  onRemoveEntry,
  subjectColors,
}: DiaryTableProps) {
  const getSubjectBadgeClass = (subject: string) => {
    return subjectColors[subject] || { badge: 'bg-gray-100', text: 'text-gray-700' };
  };

  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No entries yet. Add a subject to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 w-32">
              Subject
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 flex-1">
              Topic / Assignment
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 flex-1">
              Notes
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700 w-12">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const colors = getSubjectBadgeClass(entry.subject);
            return (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Input
                    type="text"
                    value={entry.subject}
                    onChange={(e) => onUpdateEntry(index, 'subject', e.target.value)}
                    placeholder="e.g., English"
                    className={`text-sm font-medium ${colors.text} border-0 bg-transparent px-0`}
                  />
                </td>
                <td className="px-6 py-4">
                  <Input
                    type="text"
                    value={entry.topic}
                    onChange={(e) => onUpdateEntry(index, 'topic', e.target.value)}
                    placeholder="e.g., Chapter 3: Poetry Comprehension"
                    className="text-sm border border-gray-200 rounded px-3 py-2"
                  />
                </td>
                <td className="px-6 py-4">
                  <Textarea
                    value={entry.note || ''}
                    onChange={(e) => onUpdateEntry(index, 'note', e.target.value)}
                    placeholder="Optional notes..."
                    className="text-sm border border-gray-200 rounded px-3 py-2 min-h-10 resize-none"
                    rows={1}
                  />
                </td>
                <td className="px-6 py-4 text-center">
                  <Button
                    onClick={() => onRemoveEntry(index)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
