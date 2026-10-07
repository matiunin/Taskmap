const TASK_COLORS_KEY = 'jiraTaskColors';

export const NODE_COLORS = [
  '#6C5CE7', '#A29BFE', '#00B894', '#00CEC9',
  '#74B9FF', '#0984E3', '#E17055', '#D63031',
  '#FDCB6E', '#FD79A8', '#636E72', '#2D3436',
];

export const getTaskColors = (): Record<string, string> => {
  try {
    const data = localStorage.getItem(TASK_COLORS_KEY);
    return data ? (JSON.parse(data) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

export const setTaskColor = (taskId: string, color: string): void => {
  const colors = getTaskColors();
  colors[taskId] = color;
  localStorage.setItem(TASK_COLORS_KEY, JSON.stringify(colors));
  window.dispatchEvent(new CustomEvent('jiraTaskColorsChange'));
};

export const removeTaskColor = (taskId: string): void => {
  const colors = getTaskColors();
  delete colors[taskId];
  localStorage.setItem(TASK_COLORS_KEY, JSON.stringify(colors));
  window.dispatchEvent(new CustomEvent('jiraTaskColorsChange'));
};
