# Daily Homework Diary Module

A comprehensive homework management system built for the School-Nexus platform. This module enables admins to create and publish homework assignments for classes, with real-time updates to students.

## Features

### Admin Interface
- **Class & Date Selection**: Select any class and date to manage homework
- **Subject-Topic Grid**: Add multiple subjects with detailed homework topics
- **Color-Coded Subjects**: Visual indicators for different subjects:
  - Urdu → Purple
  - English → Blue
  - Mathematics → Orange
  - Islamiat → Green
  - Science → Red
  - Social Studies → Indigo
  - P.E. → Yellow

- **Draft & Publish**: Save as draft or publish to all students
- **Real-Time Confetti Animation**: Celebratory animation on successful publish
- **Print/PDF Export**: Generate printable copies with school letterhead
- **Rich Text Support**: Add notes and additional instructions per subject

### Student Interface
- **Read-Only Diary Card**: View published homework assignments
- **Date Navigation**: Browse homework from different dates
- **Subject Icons**: Visual identification of subjects
- **Auto-Refresh**: Optional automatic refresh every 30 seconds
- **Real-Time Updates**: Instant notifications when new homework is published
- **Mobile Responsive**: Fully responsive design for all devices
- **Push Notifications**: Browser notifications for new assignments

### Real-Time Integration
- **Socket.io Integration**: Instant publish notifications
- **Auto-Refresh Option**: Manual or automatic diary updates
- **Admin Broadcast**: Publish events sent to all students in class
- **Event Subscriptions**: Students subscribe to class diary updates

## API Routes

### Admin Routes (adminAuth required)

#### Create Homework Diary
```
POST /api/admin/homework-diary
Content-Type: application/json

{
  "classId": 1,
  "date": "2026-03-15",
  "entries": [
    {
      "subject": "English",
      "topic": "Chapter 3: Poetry Comprehension",
      "note": "Complete exercises 1-5"
    },
    {
      "subject": "Mathematics",
      "topic": "Quadratic Equations",
      "note": "Solve problems from page 42"
    }
  ]
}

Response: 201 Created
{
  "id": 1,
  "classId": 1,
  "date": "2026-03-15",
  "entries": [...],
  "status": "draft",
  "createdAt": "2026-03-15T10:30:00Z"
}
```

#### Get Diary by Class & Date
```
GET /api/admin/homework-diary/:classId/:date

Response: 200 OK
{
  "id": 1,
  "classId": 1,
  "date": "2026-03-15",
  "entries": [...],
  "status": "published"
}
```

#### Update Diary
```
PUT /api/admin/homework-diary/:id
Content-Type: application/json

{
  "entries": [...],
  "status": "published"
}

Response: 200 OK
{...diary...}
```

#### Delete Diary
```
DELETE /api/admin/homework-diary/:id

Response: 200 OK
{ "success": true }
```

### Student Routes

#### Get Published Diary by Class & Date
```
GET /api/homework-diary/:classId/:date

Response: 200 OK
{
  "id": 1,
  "classId": 1,
  "date": "2026-03-15",
  "entries": [...],
  "status": "published"
}
```

#### List Published Diaries by Class
```
GET /api/homework-diary/class/:classId

Response: 200 OK
[
  {
    "id": 1,
    "classId": 1,
    "date": "2026-03-15",
    "entries": [...],
    "status": "published"
  },
  {...}
]
```

## Database Schema

The system uses PostgreSQL with Drizzle ORM:

```typescript
homeworkDiary = pgTable(
  "homework_diary",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id),
    date: date("date").notNull(),
    entries: jsonb("entries")
      .$type<
        {
          subject: string;
          topic: string;
          note?: string;
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status")
      .$type<'draft' | 'published'>()
      .notNull()
      .default("draft"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassDateIdx: uniqueIndex("homework_diary_class_id_date_idx").on(
      table.classId,
      table.date,
    ),
  }),
);
```

## Components

### Admin Page
- **File**: `pages/admin/homework-diary/index.tsx`
- **Components**:
  - `ClassSelector`: Class selection dropdown
  - `DatePicker`: Date picker with calendar
  - `DiaryTable`: Editable entries table with subject colors

### Student Page
- **File**: `pages/student/homework-diary.tsx`
- **Features**:
  - Date navigation
  - Real-time updates via Socket.io
  - Push notifications
  - Auto-refresh toggle

## Frontend Hooks

### `useHomeworkDiarySocket`
Subscribe to homework diary updates via Socket.io

```typescript
const { subscribe, unsubscribe, socket } = useHomeworkDiarySocket(classId);
```

### `useHomeworkDiaryPublishListener`
Listen for published diary events in real-time

```typescript
useHomeworkDiaryPublishListener(classId, (data) => {
  console.log('New diary published:', data);
  // Refresh UI, show notification, etc.
});
```

### `useAdminHomeworkDiaryListener`
Admin listener for publish completion confirmation

```typescript
useAdminHomeworkDiaryListener(adminId, (data) => {
  console.log('Publish complete:', data);
});
```

## Zod Validation Schemas

All API inputs are validated using Zod schemas defined in `shared/routes.ts`:

- `homeworkDiary.admin.create.input`: Create diary with entries
- `homeworkDiary.admin.getByClassDate.input`: No input validation (path params)
- `homeworkDiary.admin.update.input`: Update entries and status
- `homeworkDiary.student.getByClassDate.input`: No input validation (path params)

## Socket.io Events

### Namespace: `/homework-diary`

#### From Client
- `subscribe-class`: Subscribe to classroom diary updates
  ```
  socket.emit('subscribe-class', classId);
  ```

- `admin-subscribe`: Admin subscription to publish confirmations
  ```
  socket.emit('admin-subscribe', adminId);
  ```

#### From Server
- `diary-published`: New diary published event
  ```
  {
    id: number,
    classId: number,
    date: string,
    entries: Array<{subject, topic, note}>,
    status: 'published'
  }
  ```

- `publish-complete`: Publish operation confirmation
  ```
  {
    diaryId: number,
    success: boolean
  }
  ```

- `subscribed`: Confirmation of subscription
- `admin-subscribed`: Confirmation of admin subscription

## Usage Examples

### Creating a Homework Diary (Admin)

```typescript
const createDiary = async (classId: number, date: string, entries: any[]) => {
  const response = await fetch('/api/admin/homework-diary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, date, entries }),
  });
  return response.json();
};
```

### Publishing a Diary (Admin)

```typescript
const publishDiary = async (diaryId: number) => {
  const response = await fetch(`/api/admin/homework-diary/${diaryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'published' }),
  });
  return response.json();
};
```

### Listening for Updates (Student)

```typescript
useHomeworkDiaryPublishListener(classId, (publishedDiary) => {
  // Update local state when new diary is published
  setDiaries((prev) => [publishedDiary, ...prev]);
  
  // Show browser notification
  if (Notification?.permission === 'granted') {
    new Notification('New Homework!', {
      body: `Check your diary for ${publishedDiary.date}`,
    });
  }
});
```

## Deployment

Ensure the following environment variables are set:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/school_nexus

# Socket.io must be enabled
# (Automatically initialized in app.ts)
```

Run migrations:

```bash
npx drizzle-kit push:pg
```

Build and deploy:

```bash
npm run build
npm start
```

## Security Considerations

- **Admin Routes**: Protected by `adminAuth` middleware
- **Student Routes**: Protected by user authentication
- **Data Access**: Students can only see published diaries for their class
- **Zod Validation**: All inputs validated before processing
- **Database Constraints**: Unique class+date index prevents duplicates
- **Soft Delete**: Deletion is permanent; consider soft-delete in future versions

## Future Enhancements

- [ ] Soft-delete support with recovery
- [ ] Bulk upload from CSV/Excel
- [ ] Homework templates by subject
- [ ] Parent notifications
- [ ] Homework completion tracking
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Recurring homework patterns
- [ ] Mobile app integration
- [ ] Offline support with Service Workers

## Troubleshooting

### Diaries Not Publishing
- Check admin authentication
- Verify Socket.io namespace is connected
- Check browser console for errors

### Students Not Receiving Updates
- Verify Socket.io connection (`/homework-diary` namespace)
- Check class subscription (should emit `subscribe-class`)
- Ensure diary status is `published`

### Print Not Working
- Check print styles in admin page
- Ensure no JavaScript errors in console
- Try different browser for compatibility

## Questions & Support

For issues or questions, refer to the main project documentation or create an issue in the repository.
