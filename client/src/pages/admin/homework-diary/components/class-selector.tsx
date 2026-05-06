import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassSelectorProps {
  value: number | null;
  onChange: (classId: number) => void;
}

interface ClassOption {
  id: number;
  grade: string;
  section: string;
  stream?: string;
}

export function ClassSelector({ value, onChange }: ClassSelectorProps) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchClasses = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/v1/classes');
        if (response.ok) {
          const data = await response.json();
          setClasses(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch classes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  /** Returns a human-readable label containing only the grade and section
   *  (plus optional stream), matching the `buildClassLabel` convention used
   *  throughout the rest of the codebase.  Subject names are intentionally
   *  excluded because subjects are managed on their own dedicated pages. */
  const getClassLabel = (cls: ClassOption): string => {
    const base = `${cls.grade} ${cls.section}`;
    return cls.stream ? `${base} - ${cls.stream}` : base;
  };

  return (
    <Select
      value={value ? String(value) : ''}
      onValueChange={(val) => onChange(Number(val))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={loading ? 'Loading classes...' : 'Select class'} />
      </SelectTrigger>
      <SelectContent>
        {classes.map((cls) => (
          <SelectItem key={cls.id} value={String(cls.id)}>
            {getClassLabel(cls)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
