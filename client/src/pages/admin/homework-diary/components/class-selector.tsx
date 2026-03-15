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

  const getClassLabel = (cls: ClassOption) => {
    return `${cls.grade}-${cls.section}${cls.stream ? `-${cls.stream}` : ''}`;
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
