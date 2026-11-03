package com.hybridflow.connection.repository;

import com.hybridflow.connection.model.GoogleConnection;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.util.Optional;

@Repository @RequiredArgsConstructor
public class GoogleConnectionRepository {
    private final JdbcTemplate jdbc;

    public Optional<GoogleConnection> lock(String id) {
        return jdbc.query("SELECT * FROM google_connections WHERE id=? FOR UPDATE", (rs, number) ->
                new GoogleConnection(rs.getString("id"), rs.getString("access_token"), rs.getString("refresh_token"),
                        rs.getTimestamp("expires_at").toInstant(), rs.getString("state")), id).stream().findFirst();
    }

    public void save(GoogleConnection connection) {
        jdbc.update("INSERT INTO google_connections(id,access_token,refresh_token,expires_at,state) VALUES (?,?,?,?,?) "
                        + "ON CONFLICT(id) DO UPDATE SET access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, "
                        + "expires_at=EXCLUDED.expires_at,state=EXCLUDED.state", connection.getId(), connection.getAccessToken(),
                connection.getRefreshToken(), Timestamp.from(connection.getExpiresAt()), connection.getState());
    }

    public void requireReconnect(String id) {
        jdbc.update("UPDATE google_connections SET state='RECONNECT_REQUIRED' WHERE id=?", id);
    }
}
