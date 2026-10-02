import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
    return () => {
      subscription();
    };
  }, []);

  return online;
}
