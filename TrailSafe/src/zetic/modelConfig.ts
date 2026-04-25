import { healthCheck } from './ZeticMLange';

export async function testLocalModel(): Promise<boolean> {
  return healthCheck();
}
