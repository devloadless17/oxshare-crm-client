import { describe, expect, it, vi } from 'vitest';
import { uploadWithRetry } from './upload-retry';

/**
 * A dropped connection must not become the client's problem, and a refusal
 * must not be sent again and again. Each wrong version is silent until a client
 * on a weak line is stuck on an error, or a refused file is hammered at the API.
 */
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const refusal = () =>
  Object.assign(new Error('Request failed with status code 400'), { response: { status: 400 } });
const fast = { delaysMs: [0, 0, 0], waitForReturn: () => Promise.resolve() };

describe('a KYC upload survives the connection', () => {
  it('tries again after a dropped connection, and succeeds without the client doing anything', async () => {
    const send = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce(undefined);
    const onRetry = vi.fn();
    await uploadWithRetry(send, { ...fast, onRetry });
    expect(send).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('waits for the page to come back before trying again', async () => {
    const order: string[] = [];
    const send = vi
      .fn()
      .mockImplementationOnce(() => {
        order.push('send');
        return Promise.reject(networkError());
      })
      .mockImplementationOnce(() => {
        order.push('send');
        return Promise.resolve();
      });
    await uploadWithRetry(send, {
      delaysMs: [0],
      waitForReturn: () => {
        order.push('waited for the page');
        return Promise.resolve();
      },
    });
    expect(order).toEqual(['send', 'waited for the page', 'send']);
  });

  it('shows a refusal at once, never sending it again', async () => {
    const send = vi.fn().mockRejectedValue(refusal());
    await expect(uploadWithRetry(send, fast)).rejects.toMatchObject({ response: { status: 400 } });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a gateway that could not reach the API mid-deploy', async () => {
    const gateway = Object.assign(new Error('Bad Gateway'), { response: { status: 502 } });
    const send = vi.fn().mockRejectedValueOnce(gateway).mockResolvedValueOnce(undefined);
    await uploadWithRetry(send, fast);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after three retries, so a dead connection still ends in a message', async () => {
    const send = vi.fn().mockRejectedValue(networkError());
    await expect(uploadWithRetry(send, fast)).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('stops when the client has left the screen', async () => {
    let wanted = true;
    const send = vi.fn().mockImplementation(() => {
      wanted = false;
      return Promise.reject(networkError());
    });
    await expect(
      uploadWithRetry(send, { ...fast, stillWanted: () => wanted }),
    ).rejects.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
