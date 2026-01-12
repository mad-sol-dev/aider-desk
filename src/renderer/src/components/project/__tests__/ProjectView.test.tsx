import { screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskData, ProjectData, TaskStateData } from '@common/types';

import { ProjectView } from '../ProjectView';
import { TaskSidebar } from '../TaskSidebar';

import { useApi } from '@/contexts/ApiContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { createMockApi } from '@/__tests__/mocks/api';
import { renderWithHotkeys } from '@/__tests__/test-utils';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock contexts
vi.mock('@/contexts/ApiContext', () => ({
  useApi: vi.fn(),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: vi.fn(),
}));

vi.mock('@/contexts/ProjectSettingsContext', () => ({
  useProjectSettings: vi.fn(),
}));

interface TaskSidebarMockProps {
  tasks: TaskData[];
  onTaskSelect: (taskId: string) => void;
  deleteTask?: (taskId: string) => Promise<void>;
}

// Mock components
vi.mock('../TaskSidebar', () => ({
  TaskSidebar: vi.fn(({ tasks, onTaskSelect }: TaskSidebarMockProps) => (
    <div data-testid="task-sidebar">
      {tasks.map((task) => (
        <button key={task.id} onClick={() => onTaskSelect(task.id)}>
          {task.name}
        </button>
      ))}
    </div>
  )),
  COLLAPSED_WIDTH: 44,
  EXPANDED_WIDTH: 256,
}));

vi.mock('../TaskView', () => ({
  TaskView: ({ task }: { task: TaskData }) => <div data-testid="task-view">{task.name}</div>,
}));

describe('ProjectView', () => {
  const mockProject = { baseDir: '/mock/project' } as ProjectData;
  const mockApi = createMockApi({
    startProject: vi.fn(() => Promise.resolve()),
    getTasks: vi.fn(() => Promise.resolve([{ id: 'task-1', name: 'Task 1' }] as TaskData[])),
    createNewTask: vi.fn(() => Promise.resolve({ id: 'task-2', name: 'Task 2' } as TaskData)),
    loadTask: vi.fn(() => Promise.resolve({ messages: [], files: [], todoItems: [], question: null, workingMode: 'local' } as TaskStateData)),
  });

  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue(mockApi);
    vi.mocked(useSettings).mockReturnValue({ settings: { startupMode: 'empty' } } as ReturnType<typeof useSettings>);
    vi.mocked(useProjectSettings).mockReturnValue({ projectSettings: {} } as ReturnType<typeof useProjectSettings>);
  });

  it('initializes project and loads tasks', async () => {
    const mockShowSettingsPage = vi.fn();
    renderWithHotkeys(<ProjectView project={mockProject} isActive={true} showSettingsPage={mockShowSettingsPage} />);

    await waitFor(() => {
      expect(mockApi.startProject).toHaveBeenCalledWith(mockProject.baseDir);
      expect(mockApi.getTasks).toHaveBeenCalledWith(mockProject.baseDir);
    });
  });

  it('renders task sidebar and active task view', async () => {
    const mockShowSettingsPage = vi.fn();
    renderWithHotkeys(<ProjectView project={mockProject} isActive={true} showSettingsPage={mockShowSettingsPage} />);

    await waitFor(() => {
      expect(screen.getByTestId('task-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('task-view')).toBeInTheDocument();
      expect(screen.getAllByText('Task 1')).toHaveLength(2);
    });
  });

  it('creates a new task when the active task is deleted', async () => {
    mockApi.getTasks.mockResolvedValue([
      {
        id: 'task-1',
        name: 'Task 1',
        createdAt: '2023-01-01T00:00:00Z',
        aiderTotalCost: 0,
        agentTotalCost: 0,
        mainModel: 'gpt-4',
      },
    ] as TaskData[]);

    // We need to capture the deleteTask prop passed to TaskSidebar
    let capturedDeleteTask: ((taskId: string) => Promise<void>) | undefined;
    vi.mocked(TaskSidebar).mockImplementation(({ deleteTask }: TaskSidebarMockProps) => {
      capturedDeleteTask = deleteTask;
      return <div data-testid="task-sidebar" />;
    });

    const mockShowSettingsPage = vi.fn();
    renderWithHotkeys(<ProjectView project={mockProject} isActive={true} showSettingsPage={mockShowSettingsPage} />);

    await waitFor(() => {
      expect(capturedDeleteTask).toBeDefined();
    });

    await act(async () => {
      await capturedDeleteTask!('task-1');
    });

    expect(mockApi.deleteTask).toHaveBeenCalledWith(mockProject.baseDir, 'task-1');
    expect(mockApi.createNewTask).toHaveBeenCalled();
  });
});
