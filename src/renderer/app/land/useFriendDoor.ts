// The "join a world" field (../friends/JoinWorldField in the door and F12, and the Worlds screen):
// a friend's ENS name or their join code (加入碼; in code a door number). A code is used as typed; a
// name is followed back to the join code it carries first (net/doorByName.ts), with the button
// showing that it is looking and the field's error line saying why a name led nowhere.

import { type DoorInput, doorOf, readDoorInput, typedDoor } from "@renderer/net/doorByName";
import type { AppError } from "@shared/result";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

/** Longest ENS name a field accepts (a DNS name is at most 253 characters). */
const MAX_NAME_LENGTH = 253;

export interface FriendDoor {
  value: string;
  maxLength: number;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
  /** A full join code or a name; null while the field is neither. */
  input: DoorInput | null;
  /** Which action is following a name right now, if any. */
  resolving: string | null;
  error: AppError | null;
  /** The join code to use, or null when a name led nowhere (then `error` says why). */
  resolve(purpose: string): Promise<string | null>;
  clear(): void;
}

export function useFriendDoor(): FriendDoor {
  const [value, setValue] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const input = readDoorInput(value);
  // A panel closed while a name is being looked up must not walk through afterwards.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resolve = async (purpose: string): Promise<string | null> => {
    if (input === null || resolving !== null) return null;
    setError(null);
    setResolving(input.kind === "name" ? purpose : null);
    const door = await doorOf(input);
    if (!mounted.current) return null;
    setResolving(null);
    if (door.ok) return door.value;
    setError(door.error);
    return null;
  };

  return {
    value,
    maxLength: MAX_NAME_LENGTH,
    onChange: (event) => {
      setValue(typedDoor(event.target.value));
      setError(null);
    },
    input,
    resolving,
    error,
    resolve,
    clear: () => {
      setValue("");
      setError(null);
    },
  };
}
