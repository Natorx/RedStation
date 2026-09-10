import {
	Body,
	CanActivate,
	Controller,
	Delete,
	ExecutionContext,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
	Req,
	UseGuards,
	Injectable
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { TodosService } from './todos.service';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';
import type {
	CreateTodoDto,
	ListTodosQuery,
	TodoStatsView,
	TodoView,
	UpdateTodoDto
} from './todos.dto';

/**
 * 「可选登录」守卫：
 * - 带了 Authorization: Bearer <token> 且令牌合法时，把用户挂到 request.user；
 * - 没带或令牌无效时直接放行（不抛 401）。
 *
 * 用于 POST /api/todos —— 前端暂未全程带 token，但登录后需要记录 authorId。
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
	constructor(private readonly jwt: JwtService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthedRequest>();
		const header = req.headers.authorization;
		if (!header?.startsWith('Bearer ')) return true;

		const token = header.slice('Bearer '.length).trim();
		if (!token) return true;

		try {
			const payload = await this.jwt.verifyAsync<JwtPayload>(token);
			req.user = { id: payload.sub, uid: payload.uid, name: payload.name };
		} catch {
			// 令牌无效视为匿名访问，不影响创建待办
			req.user = undefined;
		}

		return true;
	}
}

@Controller('todos')
export class TodosController {
	constructor(private readonly todos: TodosService) {}

	/** GET /api/todos/stats — 统计（必须声明在 :id 之前，否则会被当成 id） */
	@Get('stats')
	stats(): Promise<TodoStatsView> {
		return this.todos.stats();
	}

	/** GET /api/todos — 列表，支持 type/priority/done/since/limit/offset */
	@Get()
	list(@Query() query: Record<string, string>): Promise<{ total: number; items: TodoView[] }> {
		const parsed: ListTodosQuery = {
			type: query.type,
			priority: query.priority,
			limit: query.limit ? Number(query.limit) : undefined,
			offset: query.offset ? Number(query.offset) : undefined
		};
		if (query.done === 'true' || query.done === 'false') parsed.done = query.done === 'true';
		if (query.since) parsed.since = Number(query.since);
		return this.todos.list(parsed);
	}

	/** GET /api/todos/:id — 单条 */
	@Get(':id')
	findById(@Param('id', ParseIntPipe) id: number): Promise<TodoView> {
		return this.todos.findById(id);
	}

	/** POST /api/todos — 新建；不强制登录，带合法 JWT 时记录 authorId */
	@Post()
	@UseGuards(OptionalJwtGuard)
	create(@Req() req: AuthedRequest, @Body() dto: CreateTodoDto): Promise<TodoView> {
		return this.todos.create(dto, req.user ? { id: req.user.id, name: req.user.name } : undefined);
	}

	/** PATCH /api/todos/:id — 更新，字段全部可选 */
	@Patch(':id')
	update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTodoDto): Promise<TodoView> {
		return this.todos.update(id, dto);
	}

	/** PATCH /api/todos/:id/toggle — 切换完成状态 */
	@Patch(':id/toggle')
	@HttpCode(200)
	toggle(@Param('id', ParseIntPipe) id: number): Promise<TodoView> {
		return this.todos.toggle(id);
	}

	/** DELETE /api/todos/:id — 删除 */
	@Delete(':id')
	remove(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; deleted: true }> {
		return this.todos.remove(id);
	}
}
