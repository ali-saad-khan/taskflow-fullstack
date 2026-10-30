<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProjectTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_cannot_list_projects(): void
    {
        $this->getJson('/api/v1/projects')->assertUnauthorized();
    }

    public function test_index_only_lists_own_projects_with_task_counts(): void
    {
        $me = User::factory()->create();
        $mine = Project::factory()->for($me)->create();
        Task::factory()->count(2)->for($mine)->create();
        Project::factory()->create(); // someone else's

        Sanctum::actingAs($me);

        $this->getJson('/api/v1/projects')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->id)
            ->assertJsonPath('data.0.tasks_count', 2);
    }

    public function test_store_creates_project_for_current_user(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);

        $this->postJson('/api/v1/projects', ['name' => 'Launch', 'description' => 'Ship it'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Launch');

        $this->assertDatabaseHas('projects', ['name' => 'Launch', 'user_id' => $me->id]);
    }

    public function test_store_validates_name(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/projects', ['name' => ''])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/projects', ['name' => str_repeat('a', 121)])->assertStatus(422);
    }

    public function test_show_update_and_delete_own_project(): void
    {
        $me = User::factory()->create();
        $project = Project::factory()->for($me)->create(['name' => 'Old']);
        Sanctum::actingAs($me);

        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->assertJsonPath('data.name', 'Old');
        $this->patchJson("/api/v1/projects/{$project->id}", ['name' => 'New'])->assertOk()->assertJsonPath('data.name', 'New');
        $this->deleteJson("/api/v1/projects/{$project->id}")->assertNoContent();
        $this->assertDatabaseMissing('projects', ['id' => $project->id]);
    }

    public function test_cannot_access_another_users_project(): void
    {
        $project = Project::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/v1/projects/{$project->id}")->assertForbidden()->assertJsonPath('code', 'forbidden');
        $this->patchJson("/api/v1/projects/{$project->id}", ['name' => 'Hacked'])->assertForbidden();
        $this->deleteJson("/api/v1/projects/{$project->id}")->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $project->id, 'name' => $project->name]);
    }

    public function test_missing_project_is_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/projects/9999')->assertNotFound()->assertJsonPath('code', 'not_found');
    }

    public function test_deleting_a_project_cascades_to_tasks(): void
    {
        $me = User::factory()->create();
        $project = Project::factory()->for($me)->create();
        Task::factory()->count(3)->for($project)->create();
        Sanctum::actingAs($me);

        $this->deleteJson("/api/v1/projects/{$project->id}")->assertNoContent();
        $this->assertDatabaseCount('tasks', 0);
    }
}
