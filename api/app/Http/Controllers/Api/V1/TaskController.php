<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\MoveTaskRequest;
use App\Http\Requests\Task\StoreTaskRequest;
use App\Http\Requests\Task\UpdateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Project;
use App\Models\Task;
use App\Services\TaskOrdering;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TaskController extends Controller
{
    public function __construct(private readonly TaskOrdering $ordering) {}

    public function index(Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return TaskResource::collection(
            $project->tasks()->reorder()->orderBy('status')->orderBy('position')->get()
        );
    }

    public function store(StoreTaskRequest $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $data = $request->validated();
        $status = TaskStatus::from($data['status'] ?? 'todo');
        $data['status'] = $status->value;
        $data['position'] = $this->ordering->nextPosition($project->id, $status);

        $task = $project->tasks()->create($data);

        return (new TaskResource($task->refresh()))->response()->setStatusCode(201);
    }

    public function show(Task $task): TaskResource
    {
        $this->authorize('view', $task);

        return new TaskResource($task);
    }

    public function update(UpdateTaskRequest $request, Task $task): TaskResource
    {
        $this->authorize('update', $task);

        $data = $request->validated();
        $newStatus = isset($data['status']) ? TaskStatus::from($data['status']) : null;
        unset($data['status']);

        $task->update($data);

        if ($newStatus && $newStatus !== $task->status) {
            // Status changes go to the end of the target column.
            $count = Task::where('project_id', $task->project_id)->where('status', $newStatus->value)->count();
            $task = $this->ordering->move($task, $newStatus, $count);
        }

        return new TaskResource($task);
    }

    public function move(MoveTaskRequest $request, Task $task): TaskResource
    {
        $this->authorize('update', $task);

        $task = $this->ordering->move(
            $task,
            TaskStatus::from($request->validated('status')),
            (int) $request->validated('position'),
        );

        return new TaskResource($task);
    }

    public function destroy(Task $task): JsonResponse
    {
        $this->authorize('delete', $task);

        $projectId = $task->project_id;
        $status = $task->status;
        $task->delete();
        $this->ordering->compact($projectId, $status);

        return response()->json(null, 204);
    }
}
