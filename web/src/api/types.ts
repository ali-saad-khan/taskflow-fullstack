import type {
  LoginInput,
  MoveInput,
  Project,
  ProjectInput,
  RegisterInput,
  Task,
  TaskInput,
  User,
} from "../types";

/** Mirrors the Laravel error envelope: { message, code, errors? }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export interface AuthResult {
  user: User;
}

/** The only surface the UI talks to. Implemented by httpAdapter and mockAdapter. */
export interface Api {
  readonly mode: "http" | "mock";
  auth: {
    register(input: RegisterInput): Promise<AuthResult>;
    login(input: LoginInput): Promise<AuthResult>;
    logout(): Promise<void>;
    me(): Promise<User>;
    /** True when a token/session exists locally (it may still be rejected by the server). */
    hasSession(): boolean;
  };
  projects: {
    list(): Promise<Project[]>;
    get(id: number): Promise<Project>;
    create(input: ProjectInput): Promise<Project>;
    update(id: number, input: Partial<ProjectInput>): Promise<Project>;
    remove(id: number): Promise<void>;
  };
  tasks: {
    list(projectId: number): Promise<Task[]>;
    create(projectId: number, input: TaskInput): Promise<Task>;
    update(id: number, input: Partial<TaskInput>): Promise<Task>;
    remove(id: number): Promise<void>;
    move(id: number, input: MoveInput): Promise<Task>;
  };
  /** Only the mock adapter provides this; lets the demo show optimistic rollback. */
  simulate?: {
    setFailing(failing: boolean): void;
    isFailing(): boolean;
    reset(): void;
  };
}
