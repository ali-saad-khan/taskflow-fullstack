<?php

namespace Database\Seeders;

use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::factory()->create([
            'name' => 'Demo User',
            'email' => 'demo@taskflow.test',
            'password' => 'password',
        ]);

        foreach (['Website relaunch', 'Mobile app MVP'] as $name) {
            $project = Project::factory()->for($user)->create(['name' => $name]);
            foreach (TaskStatus::cases() as $status) {
                foreach (range(0, 2) as $i) {
                    Task::factory()->for($project)->create(['status' => $status, 'position' => $i]);
                }
            }
        }
    }
}
