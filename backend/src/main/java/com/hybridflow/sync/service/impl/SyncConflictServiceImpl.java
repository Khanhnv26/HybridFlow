package com.hybridflow.sync.service.impl;

import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.SyncConflictService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@RequiredArgsConstructor
@Service
public class SyncConflictServiceImpl implements SyncConflictService {

    private final SyncConflictRepository syncConflictRepository;

    @Override
    @Transactional
    public List<SyncConflict> saveConflicts(SyncDiffResult diffResult) {

        if(!diffResult.hasConflicts()) {
            return List.of();
        }

        List<SyncConflict> savedEntities = new ArrayList<>();

        for (FieldConflict conflict : diffResult.getConflicts()) {
            SyncConflict syncConflict = SyncConflict.builder()
                    .recordId(diffResult.getRecordId())
                    .columnName(conflict.getColumn())
                    .baseValue(conflict.getBaseValue())
                    .valueA(conflict.getValueA())
                    .valueB(conflict.getValueB())
                    .status("OPEN")
                    .createdAt(LocalDateTime.now())
                    .build();
            savedEntities.add(syncConflictRepository.save(syncConflict));
        }


        return savedEntities;
    }

    @Override
    @Transactional
    public void resolveConflict(Long conflictId, String finalValue) {
        SyncConflict conflict = syncConflictRepository.findById(conflictId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy xung đột với ID: " + conflictId));

        conflict.setResolvedValue(finalValue);
        conflict.setStatus("RESOLVED");
        conflict.setResolvedAt(LocalDateTime.now());
        syncConflictRepository.save(conflict);
    }
}
