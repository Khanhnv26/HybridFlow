package com.hybridflow.workspace.support;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class PendingGoogleConnectionStore {
    private static final String SESSION_KEY = "PENDING_GOOGLE_CONNECTIONS";
    private static final long EXPIRY_SECONDS = 600;

    @SuppressWarnings("unchecked")
    private ConcurrentMap<String, PendingGoogleConnection> getMap(HttpSession session) {
        synchronized (session) {
            ConcurrentMap<String, PendingGoogleConnection> map =
                    (ConcurrentMap<String, PendingGoogleConnection>) session.getAttribute(SESSION_KEY);
            if (map == null) {
                map = new ConcurrentHashMap<>();
                session.setAttribute(SESSION_KEY, map);
            }
            return map;
        }
    }

    public void save(HttpSession session, PendingGoogleConnection pending) {
        ConcurrentMap<String, PendingGoogleConnection> map = getMap(session);
        map.put(pending.getState(), pending);
    }

    public PendingGoogleConnection consume(HttpSession session, String state) {
        if (state == null || state.isBlank()) {
            throw new ApplicationException(ErrorCode.INVALID_ARGUMENT);
        }
        ConcurrentMap<String, PendingGoogleConnection> map = getMap(session);
        PendingGoogleConnection pending = map.remove(state);
        if (pending == null) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Phiên kết nối Google không hợp lệ hoặc đã hết hạn.");
        }
        if (pending.getCreatedAt().plusSeconds(EXPIRY_SECONDS).isBefore(Instant.now())) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Yêu cầu kết nối đã quá hạn 10 phút.");
        }
        return pending;
    }
}
