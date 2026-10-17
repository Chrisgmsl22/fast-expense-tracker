import type { SignupGateState } from "@/lib/domain/signup";
import type { SignupGate } from "@/lib/repositories/signup-gate";

/** In-memory `SignupGate`; the adapter is covered by `tests/unit/signup-gate.test.ts`. */
export class FakeSignupGate implements SignupGate {
    state: SignupGateState;
    reads = 0;

    constructor(state: SignupGateState = { open: true, maxUsers: 10 }) {
        this.state = state;
    }

    async read(): Promise<SignupGateState> {
        this.reads += 1;
        return this.state;
    }
}
