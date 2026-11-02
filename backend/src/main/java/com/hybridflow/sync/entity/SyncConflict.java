package com.hybridflow.sync.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Entity
@Table(name = "sync_conflicts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SyncConflict {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String flowId;
    private String spreadsheetId;
    private String sheetName;
    private String idColumn;

    @Column(name = "record_id", nullable = false)
    private String recordId;

    @Column(name = "column_name", nullable = false)
    private String columnName;

    @Column(name = "base_value")
    private String baseValue;

    @Column(name = "value_a")
    private String valueA;

    @Column(name = "value_b")
    private String valueB;

    @Column(name = "resolved_value")
    private String resolvedValue;

    @Builder.Default
    @Column(name = "status", nullable = false)
    private String status = "OPEN";

    @Builder.Default
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
}
