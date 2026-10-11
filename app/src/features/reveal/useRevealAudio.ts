import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RevealAudioGate, revealSoundVolume, type RevealSoundCue } from "./revealAudio";

const preferenceKey = "grailhaus.revealSound";
const sources = {
  friction: require("./assets/seal-friction.wav"),
  tear: require("./assets/seal-tear.wav"),
  rise: require("./assets/card-rise.wav"),
  rotation: require("./assets/card-rotation.wav"),
  build: require("./assets/rarity-build.wav"),
  impact: require("./assets/reveal-impact.wav"),
};

export function useRevealAudio(active: boolean) {
  const player = useAudioPlayer(null);
  const gate = useMemo(() => new RevealAudioGate(), []);
  const [enabled, setEnabled] = useState(false);
  const preference = useRef({ enabled: false, revision: 0 });
  useEffect(() => {
    gate.configure(active, enabled);
    if (!active || !enabled) player.pause();
    return () => { gate.configure(false, false); player.pause(); };
  }, [active, enabled, gate, player]);
  useEffect(() => {
    let alive = true;
    const revision = preference.current.revision;
    void AsyncStorage.getItem(preferenceKey).then((value) => {
      if (alive && revision === preference.current.revision) {
        preference.current.enabled = value !== "off";
        setEnabled(value !== "off");
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const stop = useCallback(() => { gate.stop(); player.pause(); }, [gate, player]);
  const play = useCallback((cue: RevealSoundCue, eventKey: string, rarity = "COMMON") => {
    const token = gate.request(`${cue}:${eventKey}`);
    if (token === null) return;
    try {
      player.pause();
      player.replace(sources[cue]);
      // Expo Audio's native player exposes volume as a mutable property.
      // eslint-disable-next-line react-hooks/immutability
      player.volume = revealSoundVolume(cue, rarity);
      void player.seekTo(0).then(() => {
        if (gate.accepts(token)) player.play();
      }).catch(() => undefined);
    } catch {
      // Missing or unsupported audio never blocks a purchased reveal.
    }
  }, [gate, player]);
  const toggle = useCallback(() => {
    const next = !preference.current.enabled;
    preference.current = { enabled: next, revision: preference.current.revision + 1 };
    gate.configure(active, next);
    if (!next) player.pause();
    setEnabled(next);
    void AsyncStorage.setItem(preferenceKey, next ? "on" : "off").catch(() => undefined);
  }, [active, gate, player]);
  return { play, stop, enabled, toggle };
}
