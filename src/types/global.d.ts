declare global {
  namespace NodeJS {
    interface Global {
      v8: any;
      gc: () => void;
      dataService: any;
      predictiveModel: any;
    }
  }
}

declare module 'python-shell' {
  export interface Options {
    mode?: 'text' | 'json' | 'binary';
    pythonPath?: string;
    pythonOptions?: string[];
    scriptPath?: string;
    args?: string[];
    env?: NodeJS.ProcessEnv;
  }

  export class PythonShell {
    static run(
      script: string,
      options: Options,
      callback?: (err: Error | null, results?: any[]) => void
    ): PythonShell;
    
    on(event: string, listener: (...args: any[]) => void): this;
    send(message: string | object): void;
    end(callback?: (err: Error | null, exitCode: number) => void): void;
  }
}

declare module 'redis-lru' {
  import { RedisClient } from 'redis';
  
  export interface CacheOptions {
    max?: number;
    maxAge?: number;
  }

  export class RedisLRU {
    constructor(client: RedisClient, options?: CacheOptions);
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    del(key: string): Promise<void>;
    reset(): Promise<void>;
  }
}

export {}; 