import { useContext } from "react";
import { CallCtx } from "./CallProvider.jsx";

export const useCall = () => useContext(CallCtx);
