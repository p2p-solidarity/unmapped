// The friend's-door field of the door at home and of Worlds → Continent: a door number (門牌) or a
// save's ENS name. A number is used as typed; a name is followed back to the door it carries first
// (net/doorByName.ts), with the button showing that it is looking and the field's error line
// saying why a name led nowhere. Dials still keep numbers only: a pinned name is pinned as its door.

import { type DoorInput, doorOf, readDoorInput, typedDoor } from "@renderer/net/doorByName";
import type { AppError } from "@shared/result";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

/** Longest ENS name a field accepts (a DNS name is at most 253 characters). */
const MAX_NAME_LENGTH = 253;

export interface FriendDoor {
  value: string;
  maxLength: number;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
  /** A full door number or a name; null while the field is neither. */
  input: DoorInput | null;
  /** Which action is following a name right now, if any. */
  resolving: string | null;
  error: AppError | null;
  /** The door number to use, or null when a name led nowhere (then `error` says why). */
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
