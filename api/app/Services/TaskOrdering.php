<?php

namespace App\Services;

use App\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Support\Facades\DB;

/**
 * Keeps `position` contiguous (0..n-1) inside every (project, status) column.
 */
class TaskOrdering
{
    public function nextPosition(int $projectId, TaskStatus $status): int
    {
        $max = Task::where('project_id', $projectId)->where('status', $status->value)->max('position');

        return $max === null ? 0 : $max + 1;
    }

    /** Move a task to a column and index. Index is clamped to the column size. */
    public function move(Task $task, TaskStatus $status, int $position): Task
    {
        return DB::transaction(function () use ($task, $status, $position) {
            $oldStatus = $task->status;

            $ids = Task::where('project_id', $task->project_id)
                ->where('status', $status->value)
                ->where('id', '!=', $task->id)
                ->orderBy('position')->orderBy('id')
                ->pluck('id')->all();

            $position = max(0, min($position, count($ids)));
            array_splice($ids, $position, 0, [$task->id]);

            $task->status = $status;
            $task->save();
            $this->renumber($ids);

            if ($oldStatus !== $status) {
                $old = Task::where('project_id', $task->project_id)
                    ->where('status', $oldStatus->value)
                    ->orderBy('position')->orderBy('id')
                    ->pluck('id')->all();
                $this->renumber($old);
            }

            return $task->refresh();
        });
    }

    /** Close the gap left in a column after a task was deleted. */
    public function compact(int $projectId, TaskStatus $status): void
    {
        $ids = Task::where('project_id', $projectId)->where('status', $status->value)
            ->orderBy('position')->orderBy('id')->pluck('id')->all();
        $this->renumber($ids);
    }

    /** @param list<int> $ids */
    private function renumber(array $ids): void
    {
        foreach ($ids as $index => $id) {
            Task::where('id', $id)->update(['position' => $index]);
        }
    }
}
