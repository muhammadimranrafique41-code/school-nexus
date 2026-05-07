# Fix Summary: classes.map is not a function

## Problem
Multiple components in the examination feature were failing with the error:
```
classes.map is not a function
```

## Root Cause
The `useClasses` hook returns an API response with the structure:
```typescript
{
  data: ClassOption[],
  total: number
}
```

However, the examination feature components were incorrectly treating the entire response as an array:
```typescript
const { data: classData = [] } = useClasses();
const classes = classData as ClassOption[];  // ❌ Wrong: classData is an object, not an array
```

## Solution
Changed all examination feature components to correctly extract the `data` property:
```typescript
const { data: classData } = useClasses();
const classes = (classData?.data ?? []) as ClassOption[];  // ✅ Correct: extract the data array
```

## Files Fixed

### 1. ExamScheduleTab.tsx
**Before:**
```typescript
const { data: classData = [] } = useClasses();
const classes = classData as ClassOption[];
```

**After:**
```typescript
const { data: classData } = useClasses();
const classes = (classData?.data ?? []) as ClassOption[];
```

### 2. MarkEntryTab.tsx
**Before:**
```typescript
const { data: classData = [] } = useClasses();
const classes = classData as ClassOption[];
```

**After:**
```typescript
const { data: classData } = useClasses();
const classes = (classData?.data ?? []) as ClassOption[];
```

### 3. MATSummaryTab.tsx
**Before:**
```typescript
const { data: classData = [] } = useClasses();
const classes = classData as ClassOption[];
```

**After:**
```typescript
const { data: classData } = useClasses();
const classes = (classData?.data ?? []) as ClassOption[];
```

## Verification
Other files in the codebase (admin pages) were already correctly accessing `data?.data`:
- `pages/admin/class-detail.tsx` ✓
- `pages/admin/classes.tsx` ✓
- `pages/admin/promotions.tsx` ✓
- `pages/admin/timetable.tsx` ✓

## Testing
After these fixes, the following components should work correctly:
- Exam Schedule Tab (class filter dropdown)
- Mark Entry Tab (class selector in toolbar)
- MAT Summary Tab (class selector)

All `.map()` operations on the `classes` array will now work as expected.
