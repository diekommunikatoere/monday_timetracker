# Time tracking app

The first version should offer a simple time tracking functionality with the following features:

- Start/pause/stop timer for tasks
- When stopping a timer, log the time spent on the task with a timestamp (start and end time)
  - Task name input should be provided when stopping the timer
  - Duration should be automatically calculated and displayed
  - Store logged time entries in a local database or file
  - Timestamps should be in a human-readable format
  - Duration should be displayed in a user-friendly format (e.g., "2 hours, 30 minutes")
- View a list of logged time entries with task names, durations, and timestamps
  - Table or list format for easy reading
  - Sortable by date, task name, or duration

## Technologies

- Next.js for the frontend
- SQLite for local data storage
- SCSS for styling
- Local development environment for now (no deployment)
- Optional: Use Zustand for state management if needed

## UI

- Simple and clean interface
- Timer controls (start, pause, stop) prominently displayed
  - Start button to initiate the timer
  - Pause button to pause the timer (disabled when timer is not running)
  - Stop button to stop the timer (disabled when timer is not running)
- After stopping the timer, show an input field for the task name and a save button
- Below the timer, display the list of logged time entries in a table format
- Responsive design for usability on different screen sizes
  - Mobile-friendly layout
  - Clear and legible fonts
  - Consistent color scheme
  - Accessible design considerations (e.g., color contrast, keyboard navigation)

## Additional Features

- API connection to monday.com
  - Use a single user for now
  - Fetch boards and tasks from monday.com
  - Allow user to select a board and task when logging time entries
  - Allow logging time entries directly to monday.com subtasks
  - Allow user to select a role for time tracking (e.g., Developer, Designer, Manager)
  - Allow user to add comments or notes when logging time entries
