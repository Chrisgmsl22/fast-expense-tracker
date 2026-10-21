import { afterEach, vi } from "vitest";

import { nextIntlServerMock, setServerLocale } from "./intl-server";

vi.mock("next-intl/server", () => nextIntlServerMock);

afterEach(() => setServerLocale("en"));
