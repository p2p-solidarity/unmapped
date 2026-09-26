// The relay servers joined worlds may use (./ice.ts). No arguments cross, so nothing to validate.

import { IPC } from "@shared/ipc";
import { z } from "zod";
import { handle } from "../handle";
import { iceServers } from "./ice";

export function registerNetIpc(): void {
  handle(IPC.net.iceServers, z.tuple([]), () => iceServers());
}
