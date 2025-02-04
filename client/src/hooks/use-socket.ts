
export const useSocket = () => {
  return {
    connected: false,
    connect: () => {},
    disconnect: () => {},
    on: () => {},
    off: () => {},
    emit: () => {}
  };
};
