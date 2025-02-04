
// Socket functionality removed
export const useSocket = () => {
  return {
    connected: false,
    connect: () => console.warn('Socket functionality removed'),
    disconnect: () => console.warn('Socket functionality removed')
  };
};
