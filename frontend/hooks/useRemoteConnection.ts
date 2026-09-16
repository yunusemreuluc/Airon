'use client';

import { useEffect } from 'react';
import { useAIStateStore, type AIState } from '@/stores/aiStateStore';
import { useConversationStore } from '@/stores/conversationStore';
import { useRemoteStore } from '@/stores/remoteStore';
import { fetchRemoteHistory, fetchRemoteSession } from '@/services/remoteApi';
import { websocketUrl } from '@/services/apiClient';
import { fetchVoiceStatus } from '@/services/voiceApi';

// Telefonun canlı bağlantısı. Masaüstündeki `useAIStateConnection`'ın hafif
// kardeşi — o hook'u yeniden kullanmamanın üç sebebi var:
//
//  1. Demo döngüsü: masaüstünde backend yokken sahne "ölü" görünmesin diye
//     sahte durumlar oynatıyor. Telefonda bu YALAN olurdu — "PC'ye bağlı değilim"
//     dürüstçe görünmeli (Notes/Bilinen-Tuzaklar.md § Arayüzde dürüstlük).
//  2. Ses efektleri: cepteki telefon bip bip ötmemeli.
//  3. Mobil yaşam döngüsü: ekran kilitlenince tarayıcı soketi öldürüyor. Geri
//     gelindiğinde beklemeden yeniden bağlanıp kaçan satırları geçmişten
//     tamamlamak gerekiyor — masaüstünde bu durum hiç yaşanmıyor.
//
// Backend uzak bağlantıya zaten yalnızca hafif olayları yolluyor (bkz.
// backend/core/remote_auth.py REMOTE_EVENTS); webcam karesi buraya hiç gelmez.

const VALID_STATES = new Set<AIState>([
  'idle',
  'listening',
  'thinking',
  'speaking',
  'vision',
  'automation',
  'memory',
]);

const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15000;

export function useRemoteConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    const conversation = useConversationStore.getState;
    const remote = useRemoteStore.getState;

    const syncHistory = async () => {
      const { lines, unauthorized } = await fetchRemoteHistory();
      if (cancelled) return;
      if (unauthorized) {
        remote().setGate('locked');
        return;
      }
      conversation().mergeHistory(lines);
    };

    const syncStatus = async () => {
      const status = await fetchVoiceStatus();
      if (cancelled) return;
      remote().setAssistantRunning(status.connected);
      conversation().setStatus({ ready: status.ready });
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempts, 4));
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      if (socket && socket.readyState <= WebSocket.OPEN) return;
      const ws = new WebSocket(websocketUrl());
      socket = ws;

      ws.onopen = () => {
        attempts = 0;
        conversation().setConnected(true);
        // Soket açıldıktan SONRA: bu arada gelen satırlar hem canlı akışta hem
        // geçmişte olabilir, mergeHistory ikisini tekilleştiriyor.
        void syncHistory();
        void syncStatus();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const data = parsed?.data ?? {};
          switch (parsed?.event) {
            case 'log':
              if (typeof data.text === 'string') {
                conversation().mergeHistory([{ text: data.text, at: Number(data.at) }]);
              }
              break;
            case 'energy_state':
              if (VALID_STATES.has(data.state)) useAIStateStore.getState().setAIState(data.state);
              break;
            case 'assistant_status':
              conversation().setStatus({
                muted: data.muted,
                paused: data.paused,
                ready: data.ready,
                remote: data.remote,
              });
              break;
            case 'task_started':
              if (typeof data.name === 'string') remote().taskStarted(data.name, data.at);
              break;
            case 'task_finished':
              if (typeof data.name === 'string') remote().taskFinished(data.name);
              break;
            default:
              break;
          }
        } catch {
          // Beklenmedik biçim — yok say.
        }
      };

      ws.onclose = () => {
        // Eski bir soketin geç gelen kapanışı (ekran açılınca yenisi zaten
        // kurulmuş olabilir) yeni bağlantıyı "koptu" diye işaretlemesin.
        if (socket !== ws) return;
        socket = null;
        conversation().setConnected(false);
        remote().taskFinished(remote().activeTask?.name ?? '');
        if (cancelled) return;
        // Kapanışın sebebi oturumun düşmesi olabilir (PIN PC'den değişti). El
        // sıkışma reddi tarayıcıda ayırt edilemiyor (1006) — oturuma sor.
        void fetchRemoteSession().then((session) => {
          if (cancelled) return;
          if (session && !session.authenticated) {
            remote().setGate('locked');
            return;
          }
          scheduleReconnect();
        });
      };

      ws.onerror = () => ws.close();
    };

    // Ekran geri açıldı / sekmeye dönüldü: yedek zamanlayıcıyı beklemeden bağlan.
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      attempts = 0;
      if (socket?.readyState === WebSocket.OPEN) {
        void syncHistory();
      } else {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleVisible);
    connect();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleVisible);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled]);
}
